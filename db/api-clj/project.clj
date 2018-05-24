(defproject clojure-mongo "0.1.0-SNAPSHOT"
  :description "FIXME: write description"
  :url "http://example.com/FIXME"
  :license {:name "Eclipse Public License"
            :url "http://www.eclipse.org/legal/epl-v10.html"}
  :dependencies [[org.clojure/clojure "1.8.0"]
                 [com.novemberain/monger "3.1.0"]
                 [org.mongodb/mongodb-driver "3.6.0-beta2"]
                 [http-kit "2.2.0"]
                 [ring/ring-json "0.4.0"]]
  :main ^:skip-aot mongo-http.main
  :target-path "target/%s"
  :profiles {:uberjar {:aot :all}})