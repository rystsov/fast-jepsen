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
  (with-redefs [jepsen.store/start-logging! start-logging!]
    (let [config {:concurrency 12
                  :timelimit (Integer/parseInt timelimit) ;100
                  }]
      (doseq [key ["node1" "node2" "node3"]]
        (try (db/create "node1" key 0) 
          (catch Exception e (db/update "node1" key 0))))
      (jepsen.core/run! (mongo-http.harness/basic-test config)))))