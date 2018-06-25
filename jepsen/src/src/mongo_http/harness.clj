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
    [mongo-http.isolate :as isolate]
    [mongo-http.db :as db]
    [mongo-http.oracle :as id-oracle]
    [mongo-http.dispatcher :as dispatch]
    [mongo-http.checker :refer [monotonic-checker]]
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
                 (let [result (db/read (:host op) key)
                       write-id (:write-id result)
                       value (:value result)]
                   (id-oracle/observe-write-id oracle key write-id)
                   (dispatch/schedule-read dispatcher key (:host op))
                   (assoc op :type :ok, :value (independent/tuple key value), :write-id write-id))
                 (catch Exception e
                   (do
                     (dispatch/schedule-read dispatcher key (:host op))
                     (throw e))))
        
        :write (try (do (id-oracle/propose-write-id oracle key (:prev-write-id op) (:write-id op))
                        (db/cas (:host op) key (:prev-write-id op) (:write-id op) value)
                        (id-oracle/observe-write-id oracle key (:write-id op))
                        (dispatch/schedule-write dispatcher key (:host op) (+ 1 value))
                        (assoc op :type :ok))
                 (catch Exception e
                   (do
                     (dispatch/schedule-write dispatcher key (:host op) (+ 1 value))
                     (throw e))))))))

(defn nemesis []
  (->> (gen/once (gen/seq 
         (repeat {:type :info, :f :isolate-rejoin-primary, :value nil})))
       (gen/delay 5)))

(defn basic-test
  "Returns a Jepsen Test Case"
  [config]
  (let [oracle (id-oracle/create-oracle "00000000-0000-0000-0000-000000000000")
        key-to-write-node { "key1" "node1"
                            "key2" "node2"
                            "key3" "node3"}
        dispatcher (dispatch/create-dispatcher oracle ["node1" "node2" "node3"])]
    (doseq [key ["key1" "key2" "key3"]]
      (try (db/overwrite "node1" key "00000000-0000-0000-0000-000000000000" 0)
        (catch Exception e (db/create "node1" key "00000000-0000-0000-0000-000000000000" 0))))
    { :name        "memdb"
      :client      (MongoClient. dispatcher oracle)
      :concurrency 12
      :model       (model/cas-register 0)
      :net         net/iptables
      :generator   (->> (independent/concurrent-generator
                               4
                               ["key1" "key2" "key3"]
                               (fn [key] (dispatch/generator dispatcher key (get key-to-write-node key))))
                         (gen/nemesis (nemesis))
                         (gen/time-limit (:timelimit config)))
      :checker     (checker/compose
                        {:perf     (checker/perf)
                         :indep (independent/checker
                                  (checker/compose
                                    {:timeline (timeline/html)
                                     :linear   (monotonic-checker)}))})
      :nodes       ["node1" "node2" "node3"]
      :os          jepsen.os/noop
      :db          jepsen.db/noop
      :nemesis     (isolate/nemesis ["node1" "node2" "node3"])}))