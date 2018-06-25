(ns mongo-http.db
  (:use clojure.tools.logging)
  (:require 
    [clojure.tools.logging :refer [debug info warn]]
    [clj-http.client :as client]
    [clojure.data.json :as json]))

(defn primary [host]
  (:primary (:body (client/get (str "http://" host ":8000/primary")
             {:as :json,
              :socket-timeout 1000  ;; in milliseconds
              :conn-timeout 1000    ;; in milliseconds
              :accept :json}))))

(defn create [host key write-id value]
  (:body (client/post (str "http://" host ":8000/create")
             {:as :json,
              :body (json/write-str {:key key :writeID write-id :value value})
              :content-type :json
              :socket-timeout 1000  ;; in milliseconds
              :conn-timeout 1000    ;; in milliseconds
              :accept :json})))

(defn overwrite [host key write-id value]
  (:body (client/post (str "http://" host ":8000/overwrite")
             {:as :json,
              :body (json/write-str {:key key :writeID write-id :value value})
              :content-type :json
              :socket-timeout 1000  ;; in milliseconds
              :conn-timeout 1000    ;; in milliseconds
              :accept :json})))

(defn cas [host key prev-write-id write-id value]
  (:body (client/post (str "http://" host ":8000/cas")
             {:as :json,
              :body (json/write-str {:key key :prevWriteID prev-write-id :writeID write-id :value value})
              :content-type :json
              :socket-timeout 1000  ;; in milliseconds
              :conn-timeout 1000    ;; in milliseconds
              :accept :json})))

(defn read [host key]
  (let [response (:body (client/get 
                          (str "http://" host ":8000/read/" key)
                          { :as :json,
                            :socket-timeout 1000  ;; in milliseconds
                            :conn-timeout 1000    ;; in milliseconds
                            :accept :json}))]
    { :write-id (:writeID response)
      :value (:value response)
    }))