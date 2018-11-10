(ns mongo-http.harness
  (:require
    [clojure.tools.logging :refer [debug info warn]]
    [jepsen
     [nemesis :as nemesis]
     [net :as net]
     [client :as client]
     [checker :as checker]
     [generator :as gen]
     [independent :as independent]]
    [mongo-http.db :as db]
    [mongo-http.noopnemesis :as noopnemesis]
    [mongo-http.oracle :as id-oracle]
    [mongo-http.dispatcher :as dispatch]
    [mongo-http.fchecker :refer [fchecker]]
    [jepsen.checker.timeline :as timeline]
    [knossos.model :as model]
    [jepsen.db]
    [jepsen.os]))

;;;; Client

(defrecord MongoClient [dispatcher oracle]
  client/Client

  (setup! [this test node] this)

  (teardown! [this test])

  (invoke! [this test op]
    (let [[key value] (:value op)]
      (case (:f op)
        :read  (try
                 (let [result (db/read (:endpoint op) (:region op) key)
                       write-id (:write-id result)
                       value (:value result)]
                   (id-oracle/observe-write-id oracle key write-id)
                   (dispatch/schedule-read dispatcher key (:endpoint op) (:region op))
                   (assoc op :type :ok, :value (independent/tuple key value), :write-id write-id))
                 (catch Exception e
                   (do
                     (dispatch/schedule-read dispatcher key (:endpoint op) (:region op))
                     (throw e))))
        
        :write (try (do (id-oracle/propose-write-id oracle key (:prev-write-id op) (:write-id op))
                        (db/cas (:endpoint op) key (:prev-write-id op) (:write-id op) value)
                        (id-oracle/observe-write-id oracle key (:write-id op))
                        (dispatch/schedule-write dispatcher key (:endpoint op) (+ 1 value))
                        (assoc op :type :ok))

                    (catch Exception e
                      (do
                        (dispatch/schedule-write dispatcher key (:endpoint op) (+ 1 value))

                        (if (.contains (.getMessage e) "PRECONDITION-ERROR")
                          (assoc op :type :fail :message "wrong prev-write-id")
                          (throw e)))))))))

(defn nemesis []
  (->> (gen/once (gen/seq (repeat {:type :info})))
       (gen/delay 5)))

(defn basic-test
  "Returns a Jepsen Test Case"
  [config]
  (let [endpoint (:endpoint config)
        num-of-writers (:num-of-writers config)
        num-of-readers (:num-of-readers config)
        thread-per-key (+ num-of-readers num-of-writers)
        keys (:keys config)
        regions (:regions config)
        oracle (id-oracle/create-oracle "00000000-0000-0000-0000-000000000000")
        dispatcher (dispatch/create-dispatcher oracle endpoint regions)]
    { :name        "memdb"
      :client      (MongoClient. dispatcher oracle)
      :concurrency (* thread-per-key (count keys))
      :model       (model/cas-register 0)
      :net         nil
      :generator   (->> (independent/concurrent-generator
                          thread-per-key
                          keys
                          (fn [key] (dispatch/generator dispatcher key num-of-writers num-of-readers)))
                        (gen/nemesis (nemesis))
                        (gen/time-limit (:timelimit config)))
      :checker     (checker/compose
                        {:perf     (checker/perf)
                         :indep (independent/checker
                                  (checker/compose
                                    {:timeline (timeline/html)
                                     :linear   (fchecker "00000000-0000-0000-0000-000000000000" 0)}))})
      :nodes       nil
      :os          jepsen.os/noop
      :db          jepsen.db/noop
      :nemesis     (noopnemesis/nemesis) }))