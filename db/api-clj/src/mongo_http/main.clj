(ns mongo-http.main
  (:gen-class)
  (:use [org.httpkit.server])
  (:require 
    [ring.middleware.json :refer [wrap-json-body wrap-json-response]]
    [monger.core :as mg]
    [monger.collection :as mc])
  (:import
    [org.bson.types ObjectId]
    [com.mongodb DuplicateKeyException MongoClient MongoClientURI MongoCredential DB WriteConcern DBObject DBCursor Bytes
                        MongoClientOptions MongoClientOptions$Builder ServerAddress MapReduceOutput MongoException WriteResult]))

(def coll "storage")

(defn uuid [] (.toString (java.util.UUID/randomUUID)))

(defn api-read [db req key]
  (let [record (mc/find-one-as-map db coll {:key key})]
    {:status 200, :body {:key key, :value (:value record)}}))

(defn api-create [db req]
  (let [key (:key (:body req))
        value (:value (:body req))]
    (try
      (do
        (println req)
        (mc/insert db coll { :_id (ObjectId.) :key key :value value :write-id (uuid)})
        {:status 200, :body {:key key, :value value}})
    (catch DuplicateKeyException e
      (if (.isUpdateOfExisting (mc/update db coll {:key key} {"$set" {:value value}}))
        {:status 200, :body {:key key, :value value}}
        {:status 500})))))

(defn api-update [db req]
  (let [key (:key (:body req))
        value (:value (:body req))]
    (if (.isUpdateOfExisting (mc/update db coll {:key key} {"$set" {:value value}}))
        {:status 200, :body {:key key, :value value}}
        {:status 500})))

(defn router [db conn]
  (fn [req] 
    (let [uri (:uri req)]
      (if (clojure.string/starts-with? uri "/read/")
        (api-read db req (.substring uri 6))
        (case (:uri req)
          "/create" (api-create db req)
          "/update" (api-update db req)
          {:status 404})))))

(defn -main []
  (println "starting server..")
  (let [{:keys [conn db]} (mg/connect-via-uri "mongodb://node1,node2,node3/lily?replicaSet=rs0&autoReconnect=false&socketTimeoutMS=10000&connectTimeoutMS=10000&w=majority&readConcernLevel=linearizable")]
    (when-not (mc/exists? db coll)
      (mc/create db coll {:capped false}))
    (mc/ensure-index db coll (array-map :key 1) { :unique true })
    (run-server 
      (wrap-json-response(wrap-json-body (router db conn) {:keywords? true}))
      {:port 8001})))