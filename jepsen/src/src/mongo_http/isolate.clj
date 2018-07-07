(ns mongo-http.isolate
  "A nemesis 1) isolates a primary 2) waits for 20 seconds 3) re-joins it back"
  (:use clojure.tools.logging)
  (:require [jepsen.nemesis :refer [partition!]]
            [jepsen.util        :as util]
            [jepsen.net        :as net]
            [jepsen.client      :as client]
            [clojure.tools.logging :refer [info]]
            [mongo-http.db :as db]
            [clojure.set :as sets]))

(defn nemesis
  [hosts]
  (reify client/Client
    (setup! [this test _]
      (net/heal! (:net test) test)
      this)

    (invoke! [this test op]
      (case (:f op)
        :isolate-rejoin-primary 
          (let [primary (db/primary (rand-nth hosts))
                rest (for [x hosts :when (not= x primary)] x)
                grudge (atom {})]
            (info "Isolating " primary " from " rest)
            (swap! grudge assoc primary rest)
            (doseq [host rest]
              (swap! grudge assoc host [primary]))
            (partition! test @grudge)
            (info "Sleeping...")
            (Thread/sleep 20000)
            (info "Healing...")
            (net/heal! (:net test) test)
            (assoc op :value (str "Isolated/rejoined"))
          )))

    (teardown! [this test] 
      (net/heal! (:net test) test))))