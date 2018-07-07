(ns mongo-http.dispatcher
  "Dispatcher is a stateful generator. It maintains a list of tasks to yield and
   allows clients to reschedule an operation once they executed it. So if there is
   only one write operation then at any point of time there will be only one client
   executing it."
  (:require
    [jepsen
     [generator :as gen]]
    [mongo-http.oracle :as id-oracle]
    [clojure.tools.logging :refer [debug info warn]]))

(defn create-key-dispatcher-state [nodes] 
  (-> (clojure.lang.PersistentQueue/EMPTY)
      (conj { :f :write :value 0 })
      (into (map (fn [h] { :f :read :host h}) nodes))))

(defn uuid [] (.toString (java.util.UUID/randomUUID)))

(defn generator [dispatcher key write-host]
  (reify gen/Generator
    (op [generator test process]
      (let [task (atom nil)]
        (swap! dispatcher update-in [:states key]
          (fn [state]
            (let [state (if (nil? state) (create-key-dispatcher-state (:nodes @dispatcher)) state)]
              (reset! task (peek state))
              (pop state))))
        (case (:f @task)
          :read
            { :host (:host @task), :type :invoke, :f :read}
          :write
            { :host write-host
              :type :invoke
              :f :write
              :value (:value @task)
              :write-id (uuid)
              :prev-write-id (id-oracle/guess-write-id (:oracle @dispatcher) key)})))))

(defn schedule-read [dispatcher key host]
  (swap! dispatcher update-in [:states key] 
    (fn [state]
      (let [state (if (nil? state) (create-key-dispatcher-state (:nodes @dispatcher)) state)]
        (conj state {:f :read, :host host})))))

(defn schedule-write [dispatcher key host value]
  (swap! dispatcher update-in [:states key] 
    (fn [state]
      (let [state (if (nil? state) (create-key-dispatcher-state (:nodes @dispatcher)) state)]
        (conj state {:f :write, :value value})))))

(defn create-dispatcher [oracle nodes]
    (atom { :states {}
            :nodes nodes
            :oracle oracle}))