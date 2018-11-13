(ns mongo-http.noopnemesis
  "No op nemesis"
  (:use clojure.tools.logging)
  (:require [jepsen.nemesis :refer [partition!]]
            [jepsen.util        :as util]
            [jepsen.net        :as net]
            [jepsen.client      :as client]
            [clojure.tools.logging :refer [info]]
            [mongo-http.db :as db]
            [clojure.set :as sets]))

(defn nemesis
  []
  (reify client/Client
    (setup! [this test _] this)

    (invoke! [this test op]
      (assoc op :value (str "Nothing is done")))

    (teardown! [this test] this)))