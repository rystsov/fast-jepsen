(ns mongo-http.fchecktests
  (:use
    [mongo-http.fchecker])
  (:require
    [clojure.test :as test]))

; (defn valid? [state]
;   (when-not (nil? (:error @state))
;     (println (:error @state)))
;   (nil? (:error @state)))

; (defn invalid? [state]
;   (not (nil? (:error @state))))

; (def clock (atom 0))
; (defn ts [] (swap! clock inc))

; ; as expected:

; (def state (create-state "0000" 0))

; ;   read after write
; (start-write state (ts) "0000" "001a" 1)
; (end-write state (ts) "001a")
; (start-read state (ts) "process1")
; (end-read state (ts) "process1" "001a" 1)
; (test/is (valid? state))

; ;   invisible chain/delayed read
; (start-write state (ts) "001a" "002a" 2)
; (start-write state (ts) "002a" "003a" 3)
; (start-write state (ts) "003a" "004a" 4)
; (start-read state (ts) "process2")
; (end-read state (ts) "process2" "004a" 4)
; (test/is (valid? state))

; ; can't propose the same write-id twice
; (test/is (thrown? AssertionError (start-write state (ts) "003a" "004a" 4)))

; ; events should be in time order
; (test/is (thrown? AssertionError (start-read state (- (ts) 2) "process2")))
; (test/is (thrown? AssertionError (start-write state (- (ts) 3) "004a" "005a" 5)))
; (start-read state (ts) "process2")
; (test/is (thrown? AssertionError (end-read state (- (ts) 2) "process2" "004a" 4)))
; (start-write state (ts) "004a" "005a" 5)
; (test/is (thrown? AssertionError (end-write state (- (ts) 2) "005a")))
; (end-write state (ts) "005a")
; (end-read state (ts) "process2" "005a" 5)
; (test/is (valid? state))

; ;   read with concurent write returns "old" value
; (start-read state (ts) "process1")
; (start-write state (ts) "005a" "006a" 6)
; (end-write state (ts) "006a")
; (end-read state (ts) "process1" "005a" 5)
; (test/is (valid? state))

; (start-read state (ts) "process1")
; (start-write state (ts) "006a" "007a" 7)
; (end-read state (ts) "process1" "006a" 6)
; (end-write state (ts) "007a")
; (test/is (valid? state))

; ;   read with concurent write returns "new" value
; (start-read state (ts) "process1")
; (start-write state (ts) "007a" "008a" 8)
; (end-write state (ts) "008a")
; (end-read state (ts) "process1" "008a" 8)
; (test/is (valid? state))

; (start-read state (ts) "process1")
; (start-write state (ts) "008a" "009a" 9)
; (end-read state (ts) "process1" "009a" 9)
; (end-write state (ts) "009a")
; (test/is (valid? state))

; ;   concurent read "confirms" write
; (start-read state (ts) "process1")
; (start-write state (ts) "009a" "010a" 10)
; (end-read state (ts) "process1" "010a" 10)
; (start-read state (ts) "process1")
; (end-read state (ts) "process1" "010a" 10)


; ; violations:
; ;   read what wasn't written: wrong value
; (def state (create-state "0000" 0))
; (start-read state (ts) "process1")
; (end-read state (ts) "process1" "0000" 1)
; (test/is (invalid? state))

; ;   read what wasn't written: wrong write-id
; (def state (create-state "0000" 0))
; (start-read state (ts) "process1")
; (end-read state (ts) "process1" "0001" 0)
; (test/is (invalid? state))

; ;   stale reads
; (def state (create-state "0000" 0))
; (start-write state (ts) "0000" "001a" 1)
; (end-write state (ts) "001a")
; (start-read state (ts) "process1")
; (end-read state (ts) "process1" "0000" 0)
; (test/is (invalid? state))

; ;   accepting conflicting writes

; (def state (create-state "0000" 0))
; (start-write state (ts) "0000" "001a" 1)
; (start-write state (ts) "0000" "001b" 1)
; (end-write state (ts) "001a")
; (end-write state (ts) "001b")
; (test/is (invalid? state))

; ;   observing conflicting chains

; (def state (create-state "0000" 0))
; (start-write state (ts) "0000" "001a" 1)
; (start-write state (ts) "001a" "002a" 2)
; (start-write state (ts) "002a" "003a" 3)
; (start-write state (ts) "0000" "001b" 1)
; (start-write state (ts) "001a" "002b" 2)
; (start-read state (ts) "process1")
; (end-read state (ts) "process1" "002b" 2)
; (start-read state (ts) "process1")
; (end-read state (ts) "process1" "003a" 3)
; (test/is (invalid? state))