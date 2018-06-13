(ns mongo-http.db
  (:use clojure.tools.logging)
  (:require 
    [clj-http.client :as client]
    [clojure.data.json :as json]))

(defn primary [host]
  (:primary (:body (client/get (str "http://" host ":8000/primary")
             {:as :json,
              :socket-timeout 1000  ;; in milliseconds
              :conn-timeout 1000    ;; in milliseconds
              :accept :json}))))

(defn create [host key value]
  (:body (client/post (str "http://" host ":8000/create")
             {:as :json,
              :body (json/write-str {:key key :value value})
              :content-type :json
              :socket-timeout 1000  ;; in milliseconds
              :conn-timeout 1000    ;; in milliseconds
              :accept :json})))

(defn update [host key value]
  (:body (client/post (str "http://" host ":8000/update")
             {:as :json,
              :body (json/write-str {:key key :value value})
              :content-type :json
              :socket-timeout 1000  ;; in milliseconds
              :conn-timeout 1000    ;; in milliseconds
              :accept :json})))

(defn increase [host key value]
  (:body (client/post (str "http://" host ":8000/increase")
             {:as :json,
              :body (json/write-str {:key key :value value})
              :content-type :json
              :socket-timeout 1000  ;; in milliseconds
              :conn-timeout 1000    ;; in milliseconds
              :accept :json})))

(defn read [host key]
  (:value (:body (client/get (str "http://" host ":8000/read/" key)
             {:as :json,
              :socket-timeout 1000  ;; in milliseconds
              :conn-timeout 1000    ;; in milliseconds
              :accept :json}))))