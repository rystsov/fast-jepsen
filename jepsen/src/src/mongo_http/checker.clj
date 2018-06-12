(ns mongo-http.checker
  (:gen-class)
  (:require
    [jepsen.checker]
    [clojure.tools.logging :refer [info]]))

(defn monotonic-checker []
  (reify jepsen.checker/Checker
    (check [this test model history opts]
      (let [history (->> history
                         (filter #(or (= :read (:f %)) (= :write (:f %))))
                         (filter #(or (= :invoke (:type %)) (= :ok (:type %))))
                         (sort-by #(:time %)))
            known (atom 0)
            known-on-read-start (atom {})
            is-valid (atom true)
            error (atom nil)]
        
        (loop [history history]
          (when-not (empty? history)
            (let [record (first history)]
              (case [(:type record) (:f record)]
                [:invoke :read]
                  (do (swap! known-on-read-start assoc (:process record) @known)
                      (recur (rest history)))
          
                [:invoke :write]
                  (recur (rest history))
          
                [:ok :write]
                  (do (swap! known max (:value record))
                      (recur (rest history)))
          
                [:ok :read]
                  (let [read-value (:value record)
                        process (:process record)
                        known-value (get @known-on-read-start process)]
                    (if (< read-value known-value)
                      (do (reset! is-valid false)
                          (reset! error (str "Process " process " read " read-value " but before read started it was already known that the value is at least " known-value)))
                      (do (swap! known max (:value record))
                          (recur (rest history)))))))))
          
        {:valid? @is-valid
         :some-details @error}))))