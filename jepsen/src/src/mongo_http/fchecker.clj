(ns mongo-http.fchecker
  (:require
    [jepsen.checker]
    [clojure.tools.logging :refer [debug info warn]]))

(defn create-state [write-id value]
  (atom { :write-ids #{write-id}
          :accepted-writes { write-id { :value value
                                        :prev-write-id nil
                                        :lts 0
                                        :observed-at 0}}
          :accepted-latest write-id
          :pending-writes {}
          :pending-reads {}
          :error nil
          :last-ts 0 }))

(defn start-write [state ts prev-write-id write-id value]
  (assert (<= (:last-ts @state) ts) (str "Events should be processed in order they happened. Known: " (:last-ts @state) "Incoming: " ts))
  (assert (not (contains? (:write-ids @state) write-id)) (str "Write-ids should be unique, '" write-id "' causes collision"))
  
  (swap! state assoc :last-ts ts)
  (swap! state update-in [:write-ids] conj write-id)
  (swap! state assoc-in [:pending-writes write-id] { :prev-write-id prev-write-id
                                                     :value value}))

(defn observe-write [state ts write-id]
  (assert (not (contains? (:accepted-writes @state) write-id)))
  (let [tail (atom ())
        canditate write-id
        lts (atom (:lts (get (:accepted-writes @state) (:accepted-latest @state))))]
    (loop [write-id write-id]
      (if (contains? (:pending-writes @state) write-id)
        (let [pending (get (:pending-writes @state) write-id)
              prev-write-id (:prev-write-id pending)
              value (:value pending)]
          (swap! state update-in [:pending-writes] dissoc write-id)
          (swap! tail conj [write-id prev-write-id value])
          (if (contains? (:accepted-writes @state) prev-write-id)
            (if (= (:accepted-latest @state) prev-write-id)
              (do (doseq [[write-id prev-write-id value] @tail]
                    (swap! state assoc-in [:accepted-writes prev-write-id :next-write-id] write-id)
                    (swap! state assoc-in [:accepted-writes write-id] { :value value
                                                                        :prev-write-id prev-write-id
                                                                        :lts (swap! lts inc)
                                                                        :observed-at ts}))
                  (swap! state assoc :accepted-latest canditate))
              
              (let [chain (conj (into [] (map (fn [[x y z]] x) @tail)) prev-write-id)
                    opponent (:next-write-id (get (:accepted-writes @state) prev-write-id))]
                (swap! state assoc :error (str "Can't observe/accept '" (clojure.string/join " -> " chain) "' write-id chain because it conflicts with already observed '" opponent " -> " prev-write-id "'"))))
            (recur prev-write-id)))
        (swap! state assoc :error (str "Can't observe/accept '" write-id "' write-id because it wasn't proposed"))))))

(defn end-write [state ts write-id]
  (assert (<=  (:last-ts @state) ts) (str "Events should be processed in order they happened. Known: " (:last-ts @state) "Incoming: " ts))
  (swap! state assoc :last-ts ts)
  (when-not (contains? (:accepted-writes @state) write-id)
    (observe-write state ts write-id))
  @state)

(defn start-read [state ts process]
  (assert (<=  (:last-ts @state) ts) (str "Events should be processed in order they happened. Known: " (:last-ts @state) "Incoming: " ts))
  (swap! state assoc :last-ts ts)
  (swap! state assoc-in [:pending-reads process] [ts (:accepted-latest @state)]))

(defn check-read [state read-at process write-id value]
  (let [[read-started-at known-write-id] (get (:pending-reads @state) process)
      known-write (get (:accepted-writes @state) known-write-id)
      read-write  (get (:accepted-writes @state) write-id)]
  (assert (not (nil? known-write)))
  
  (cond
    (> (:lts known-write) (:lts read-write))
      (let [chain (atom [])]
        (loop [kwid known-write-id]
          (assert (not (nil? kwid)))
          (swap! chain conj kwid)
          (when (not= kwid write-id)
            (recur (:prev-write-id (get (:accepted-writes @state) kwid)))))
        (swap! state assoc :error (str "Read read at " read-at " '" write-id "' write-id but a fresher '" (clojure.string/join " -> " @chain) "' write-id chain was already known at " (:observed-at known-write) " before the read started (" read-started-at ")")))
      
    (not= (:value read-write) value)
      (swap! state assoc :error (str "Read value '" value "' doesn't match a value '" (:value read-write) "' associated with '" write-id))
    
    :else nil)))

(defn end-read [state ts process write-id value]
  (assert (<=  (:last-ts @state) ts) (str "Events should be processed in order they happened. Known: " (:last-ts @state) "Incoming: " ts))
  (assert (contains? (:pending-reads @state) process))
  (swap! state assoc :last-ts ts)

  (cond
    (contains? (:accepted-writes @state) write-id)
      (check-read state ts process write-id value)
    
    (contains? (:pending-writes @state) write-id)
      (do (observe-write state ts write-id)
          (when (nil? (:error @state))
            (do (assert (contains? (:accepted-writes @state) write-id))
                (assert (= (:accepted-latest @state) write-id))
                (check-read state ts process write-id value))))

    :else
      (swap! state assoc :error (str "Can't read '" write-id "' write-id because it wasn't proposed")))
    
  (swap! state update-in [:pending-reads] dissoc process))

(defn fchecker [write-id value]
  (reify jepsen.checker/Checker
    (check [this test model history opts]
      (let [history (->> history
                         (filter #(or (= :read (:f %)) (= :write (:f %))))
                         (filter #(or (= :invoke (:type %)) (= :ok (:type %))))
                         (sort-by #(:time %)))
            state (create-state write-id value)]
        
        (loop [history history]
          (when-not (empty? history)
            (let [record (first history)
                  time (:time record)]
              (case [(:type record) (:f record)]
                [:invoke :read]
                  (let [process (:process record)]
                    (start-read state time process))
          
                [:invoke :write]
                  (let [value (:value record)
                        write-id (:write-id record)
                        prev-write-id (:prev-write-id record)]
                    (start-write state time prev-write-id write-id value))
          
                [:ok :write]
                  (let [write-id (:write-id record)]
                    (end-write state time write-id))
          
                [:ok :read]
                  (let [value (:value record)
                        process (:process record)
                        write-id (:write-id record)]
                    (end-read state time process write-id value)))
              (when (nil? (:error @state))
                (recur (rest history))))))

        {:valid? (nil? (:error @state))
         :some-details (:error @state)}))))