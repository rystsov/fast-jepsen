(ns mongo-http.db
  "API to work with MongoDB via an exposed HTTP interface"
  (:use clojure.tools.logging)
  (:require
    [clojure.tools.logging :refer [debug info warn]]
    [clj-http.client :as client]
    [clojure.data.json :as json]))

(def TIMEOUT 10000) ;; in milliseconds

(defn topology
  "Returns regions and primary region"
  [endpoint]
  (let [response (client/get
                     (str "http://" endpoint "/topology")
                     { :as :json,
                       :socket-timeout TIMEOUT
                       :conn-timeout TIMEOUT
                       :accept :json})]
    (if (= (:status response) 200)
      (:body response)
      (throw (Exception. (str "Got" (:status response) " status code :( expected 200"))))))

(defn create [endpoint key write-id value]
  "Creates a new record & returns it or throws an exception
   The record has the following form:
     { :key \"...\", :value \"...\" }"
  (let [response (client/post
                   (str "http://" endpoint "/create")
                   { :as :json,
                     :body (json/write-str {:key key :writeID write-id :value value})
                     :content-type :json
                     :socket-timeout TIMEOUT
                     :conn-timeout TIMEOUT
                     :accept :json})]
    (if (= (:status response) 200)
      (:body response)
      (throw (Exception. (str "Got" (:status response) " status code :( expected 200"))))))

(defn overwrite
  "Overwrites the current record and returns it"
  [endpoint key write-id value]
  (let [response (client/post
                   (str "http://" endpoint "/overwrite")
                   { :as :json,
                     :body (json/write-str {:key key :writeID write-id :value value})
                     :content-type :json
                     :socket-timeout TIMEOUT
                     :conn-timeout TIMEOUT
                     :accept :json})]
    (if (= (:status response) 200)
      (:body response)
      (throw (Exception. (str "Got" (:status response) " status code :( expected 200"))))))

(defn cas
  "Overwrites the current record if it's writeID is prev-write-id"
  [endpoint key prev-write-id write-id value]
  (let [response (client/post
                   (str "http://" endpoint "/cas")
                   { :as :json,
                     :body (json/write-str { :key key
                                             :prevWriteID prev-write-id
                                             :writeID write-id
                                             :value value })
                     :content-type :json
                     :socket-timeout TIMEOUT
                     :conn-timeout TIMEOUT
                     :accept :json
                     :throw-exceptions false})]
    (cond
      (= 200 (:status response))
        (:body response)

      (= 409 (:status response))
        (throw (Exception. "PRECONDITION-ERROR"))

      :else
        (throw (Exception. (str "Got" (:status response) " status code :( expected 200"))))))

(defn read [endpoint region key]
  (let [response (client/get 
                   (str "http://" endpoint "/read/" region "/" key)
                   { :as :json,
                     :socket-timeout TIMEOUT
                     :conn-timeout TIMEOUT
                     :accept :json
                     :throw-exceptions false})]
    (cond
      (= 200 (:status response))
        { :write-id (:writeID (:body response))
          :value (:value (:body response))}

      (and (= 404 (:status response))
           (contains? (:headers response) "KEY-MISSING"))
        nil

      :else
        (throw (Exception. (str "Got" (:status response) " status code :( expected 200"))))))