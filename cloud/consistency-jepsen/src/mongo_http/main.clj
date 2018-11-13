(ns mongo-http.main
  (:gen-class)
  (:require
    [jepsen.reconnect :as rc]
    [clojure.tools.logging :refer [info]]
    [jepsen [store]
     [core]]
    [mongo-http.harness]
    [mongo-http.db :as db]
    [unilog.config :as unilog]))

(defn start-logging!
  "Here we can configure the logging (some java libraries are very talkative and it makes sense to mute them)."
  [test]
  (unilog/start-logging!
    {:level   "info"
     :console   false
     :appenders [{:appender :console
                  :pattern "%p\t[%t] %c: %m%n"}
                 {:appender :file
                  :encoder :pattern
                  :pattern "%d{ISO8601}{GMT}\t%p\t[%t] %c: %m%n"
                  :file (.getCanonicalPath (jepsen.store/path! test "jepsen.log"))}]
     :overrides  {"org.apache.http" :off}
     }))

(defn -main [timelimit]
  (unilog/start-logging!
    {:level   "info"
     :overrides  {"org.apache.http" :off}})

  (let [endpoint "127.0.0.1:13452"
        zero-write-id "00000000-0000-0000-0000-000000000000"
        topology (db/topology endpoint)
        region (rand-nth (:regions topology))]
    (info "topology:" topology)
    (doseq [key  ["key1" "key2" "key3" "key4"]]
      (let [value (db/read endpoint region key)]
        (cond
          (nil? value)
            (db/create endpoint key zero-write-id 0)

          (or (not= (:write-id value) zero-write-id)
              (not= (:value value) (int 0)))
              (db/overwrite endpoint key zero-write-id 0))))
    (with-redefs [jepsen.store/start-logging! start-logging!]
      (let [config {:endpoint endpoint
                    :keys ["key1"]
                    :num-of-writers 2
                    :num-of-readers 3
                    :regions (conj (:regions topology) "null")
                    :timelimit (Integer/parseInt timelimit)
                    }]
        (jepsen.core/run! (mongo-http.harness/basic-test config))))))