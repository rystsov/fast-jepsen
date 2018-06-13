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
    [mongo-http.checker :refer [monotonic-checker]]
    [jepsen.checker.timeline :as timeline]
    [knossos.model :as model]
    [jepsen.db]
    [jepsen.os]))

;;;; Generators

(defprotocol TaskDispatcherProtocol
  (generator [self])
  (schedule [self host f value]))

(defrecord TaskDispatcher [state]
  TaskDispatcherProtocol
    (generator [self]
      (reify gen/Generator
        (op [generator test process]
          (let [task (atom nil)]
            (swap! state update-in [:tasks] (fn [queue] 
                                              (reset! task (peek queue))
                                              (pop queue)))
            {:type :invoke, :f (:f @task), :value (:value @task), :host (:host @task)}))))
    (schedule [self host f value]
      (swap! state update-in [:tasks] (fn [queue]
                                              (conj queue {:host host, :f f, :value value})))))

(defn create-dispatcher []
  (TaskDispatcher. 
    (atom { :tasks (-> (clojure.lang.PersistentQueue/EMPTY)
                       (conj
                         { :host nil     :f :write :value 0 }
                         { :host "node1" :f :read :value nil }
                         { :host "node2" :f :read :value nil }
                         { :host "node3" :f :read :value nil })) })))

(def dispatchers {
  "node1" (create-dispatcher)
  "node2" (create-dispatcher)
  "node3" (create-dispatcher)
})

;;;; Client

(defrecord MongoClient []
  client/Client

  (setup! [this test node] this)

  (teardown! [this test])

  (invoke! [this test op]
    (let [[key value] (:value op)]
      (case (:f op)
        :read 
              (try
                (let [value (db/read (:host op) key)]
                  (schedule (get dispatchers key) (:host op) :read nil)
                  (assoc op :type :ok, :value (independent/tuple key value)))
                (catch Exception e
                  (do
                    (schedule (get dispatchers key) (:host op) :read nil)
                    (throw e))))
        :write 
               (try (do (db/increase key key value)
                        (schedule (get dispatchers key) nil :write (+ 1 value))
                        (assoc op :type :ok))
                 (catch Exception e
                   (do
                     (schedule (get dispatchers key) nil :write (+ 1 value))
                     (throw e))
                 ))))))

(defn nemesis []
  (->> (gen/once (gen/seq 
         (repeat {:type :info, :f :isolate-rejoin-primary, :value nil})))
       (gen/delay 5)))

(defn basic-test
  "Returns a Jepsen Test Case"
  [config]
  {:name        "memdb"
   :client      (MongoClient.)
   :concurrency 12
   :model       (model/cas-register 0)
   :net         net/iptables
   :generator   (->> (independent/concurrent-generator
                            4
                            ["node1" "node2" "node3"]
                            (fn [k] (generator (get dispatchers k))))
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
   :nemesis     (isolate/nemesis ["node1" "node2" "node3"])})