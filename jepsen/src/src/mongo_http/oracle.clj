(ns mongo-http.oracle
  (:require
    [clojure.tools.logging :refer [debug info warn]]))

(defn create-oracle []
  (atom { :latests (conj clojure.lang.PersistentQueue/EMPTY
                      "00000000-0000-0000-0000-000000000000"
                      "00000000-0000-0000-0000-000000000000"
                      "00000000-0000-0000-0000-000000000000"
                      "00000000-0000-0000-0000-000000000000"
                      "00000000-0000-0000-0000-000000000000")
          :accepted-chain   { "00000000-0000-0000-0000-000000000000" nil}
          :accepted-latest  "00000000-0000-0000-0000-000000000000"
          :pending          {}}))

(defn str-state [state]
  (update-in @state [:latests] vec))

(defn propose-write-id [oracle prev-write-id write-id]
  (swap! oracle (fn [state]
    (cond
      (contains? (:accepted-chain state) write-id)
        (do (info (str "Write-id '" write-id "' has been already proposed"))
            state)
      (contains? (:pending state) write-id)
        (do (info (str "Write-id '" write-id "' has been already proposed"))
            state)
      :else
        (assoc-in state [:pending write-id] prev-write-id)))))

(defn observe-write-id [oracle write-id]
  (swap! oracle (fn [state]
    (let [latest-canditate write-id
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

(defn guess-write-id [oracle]
  (if (= 0 (rand-int 2))
    (:accepted-latest @oracle)
    (rand-nth (:latests @oracle))))