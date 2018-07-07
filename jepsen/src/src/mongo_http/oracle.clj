(ns mongo-http.oracle
  "After a client reads or writes a value it is extected to invoke observe-write-id.
   Just before a write they should invoke propose-write-id. Based on this information
   oracle guesses the current version and a client can fetch it with guess-write-id.
   
   Overwise, executing a compare-and-set operation requires to read a record from
   the DB, checks its version and perform the db cas write. An additional operation
   (read) reduces frequency of logical operations and hence the chance of finding a
   violation"
  (:require
    [clojure.tools.logging :refer [debug info warn]]))

(defn str-state [state]
  (update-in @state [:latests] vec))

(defn create-key-oracle-state [initial-write-id]
  { :latests (conj clojure.lang.PersistentQueue/EMPTY
                initial-write-id
                initial-write-id
                initial-write-id
                initial-write-id
                initial-write-id)
    :accepted-chain   { initial-write-id nil}
    :accepted-latest  initial-write-id
    :pending          {} })

(defn create-oracle [initial-write-id]
  (atom { :initial-write-id initial-write-id
          :states {}}))

(defn propose-write-id [oracle key prev-write-id write-id]
  (swap! oracle update-in [:states key]
    (fn [state]
      (let [initial-write-id (:initial-write-id @oracle)
            state (if (nil? state) (create-key-oracle-state initial-write-id) state)]
        (cond
          (contains? (:accepted-chain state) write-id)
            (do (info (str "Write-id '" write-id "' has been already proposed"))
                state)
          (contains? (:pending state) write-id)
            (do (info (str "Write-id '" write-id "' has been already proposed"))
                state)
          :else
            (assoc-in state [:pending write-id] prev-write-id))))))

(defn observe-write-id [oracle key write-id]
  (swap! oracle update-in [:states key] (fn [state]
    (let [initial-write-id (:initial-write-id @oracle)
          state (if (nil? state) (create-key-oracle-state initial-write-id) state)
          latest-canditate write-id
          ref-state (atom state)
          ref-tail (atom [])]
      (swap! ref-state update-in [:latests] (fn [latests] (pop (conj latests write-id))))
      (when-not (contains? (:accepted-chain @ref-state) write-id)
        (loop [write-id write-id]
          (cond
            (contains? (:pending @ref-state) write-id)
              (let [prev-write-id (get (:pending @ref-state) write-id)]
                (swap! ref-state update-in [:pending] dissoc write-id)
                (swap! ref-tail conj [write-id prev-write-id])
                (when-not (contains? (:accepted-chain @ref-state) prev-write-id)
                  (recur prev-write-id)))
            :else
              (do
                (info (str "Can't observe a write-id '" write-id "' which isn't part of pending and accepted-chain"))
                (swap! ref-tail conj [write-id nil]))))
        (swap! ref-state update-in [:accepted-chain] into @ref-tail)
        (swap! ref-state assoc :accepted-latest latest-canditate))
      @ref-state))))

(defn guess-write-id [oracle key]
  (let [result (atom nil)]
    (swap! oracle update-in [:states key]
      (fn [state]
        (let [initial-write-id (:initial-write-id @oracle)
              state (if (nil? state) (create-key-oracle-state initial-write-id) state)]
          (reset! result (if (= 0 (rand-int 2))
                           (:accepted-latest state)
                           (rand-nth (:latests state))))
          state)))
    @result))