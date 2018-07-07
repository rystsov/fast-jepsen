(ns mongo-http.db
  "API to work with MongoDB via an exposed HTTP interface"
  (:use clojure.tools.logging)
  (:require 
    [clojure.tools.logging :refer [debug info warn]]
    [clj-http.client :as client]
    [clojure.data.json :as json]))

(defn primary
  "Returns a node name (string) of a current primary"
  [host]
  (let [response (client/get
                     (str "http://" host ":8000/primary")
                     { :as :json,
                       :socket-timeout 1000  ;; in milliseconds
                       :conn-timeout 1000    ;; in milliseconds
                       :accept :json})]
    (if (= (:status response) 200)
      (:primary (:body response))
      (throw (Exception. (str "Got" (:status response) " status code :( expected 200"))))))

(defn create [host key write-id value]
  "Creates a new record & returns it or throws an exception
   The record has the following form:
     { :key \"...\", :value \"...\" }"
  (let [response (client/post
                   (str "http://" host ":8000/create")
                   { :as :json,
                     :body (json/write-str {:key key :writeID write-id :value value})
                     :content-type :json
                     :socket-timeout 1000  ;; in milliseconds
                     :conn-timeout 1000    ;; in milliseconds
                     :accept :json})]
    (if (= (:status response) 200)
      (:body response)
      (throw (Exception. (str "Got" (:status response) " status code :( expected 200"))))))

(defn overwrite
  "Overwrites the current record and returns it"
  [host key write-id value]
  (let [response (client/post
                   (str "http://" host ":8000/overwrite")
                   { :as :json,
                     :body (json/write-str {:key key :writeID write-id :value value})
                     :content-type :json
                     :socket-timeout 1000  ;; in milliseconds
                     :conn-timeout 1000    ;; in milliseconds
                     :accept :json})]
    (if (= (:status response) 200)
      (:body response)
      (throw (Exception. (str "Got" (:status response) " status code :( expected 200"))))))

(defn cas
  "Overwrites the current record if it's writeID is prev-write-id"
  [host key prev-write-id write-id value]
  (let [response (client/post
                   (str "http://" host ":8000/cas")
                   { :as :json,
                     :body (json/write-str { :key key
                                             :prevWriteID prev-write-id
                                             :writeID write-id
                                             :value value })
                     :content-type :json
                     :socket-timeout 1000
                     :conn-timeout 1000
                     :accept :json})]
    (if (= (:status response) 200)
      (:body response)
      (throw (Exception. (str "Got" (:status response) " status code :( expected 200"))))))

(defn read [host key]
  (let [response (client/get 
                   (str "http://" host ":8000/read/" key)
                   { :as :json,
                     :socket-timeout 1000  ;; in milliseconds
                     :conn-timeout 1000    ;; in milliseconds
                     :accept :json})]
    (if (= (:status response) 200)
      { :write-id (:writeID (:body response))
        :value (:value (:body response))}
      (throw (Exception. (str "Got" (:status response) " status code :( expected 200"))))))