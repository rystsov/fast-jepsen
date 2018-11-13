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

(defn create-key-dispatcher-state [endpoint regions num-of-writers num-of-readers]
  (-> (clojure.lang.PersistentQueue/EMPTY)
      (into (take num-of-writers (repeat { :f :write, :endpoint endpoint, :value 0 })))
      (into (map (fn [region] { :f :read, :endpoint endpoint, :region region}) (take num-of-readers (cycle regions))))))

(defn uuid [] (.toString (java.util.UUID/randomUUID)))

(defn generator [dispatcher key num-of-writers num-of-readers]
  (reify gen/Generator
    (op [generator test process]
      (let [task (atom nil)]
        (swap! dispatcher update-in [:states key]
          (fn [state]
            (let [state (if (nil? state) (create-key-dispatcher-state (:endpoint @dispatcher) (:regions @dispatcher) num-of-writers num-of-readers) state)]
              (reset! task (peek state))
              (pop state))))
        (case (:f @task)
          :read
            { :endpoint (:endpoint @task), :region (:region @task), :type :invoke, :f :read}
          :write
            { :endpoint (:endpoint @task)
              :type :invoke
              :f :write
              :value (:value @task)
              :write-id (uuid)
              :prev-write-id (id-oracle/guess-write-id (:oracle @dispatcher) key)})))))

(defn schedule-read [dispatcher key endpoint region]
  (swap! dispatcher update-in [:states key] 
    (fn [state]
      (conj state {:f :read, :endpoint endpoint, :region region}))))

(defn schedule-write [dispatcher key endpoint value]
  (swap! dispatcher update-in [:states key] 
    (fn [state]
      (conj state {:f :write, :endpoint endpoint, :value value}))))

(defn create-dispatcher [oracle endpoint regions]
    (atom { :states {}
            :endpoint endpoint
            :regions regions
            :oracle oracle}))