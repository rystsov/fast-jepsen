#!/bin/bash

if [[ -f /root/.ssh/id_rsa && -f /root/.ssh/id_rsa.pub ]]; then
  echo "Keys already exist"
else
  ssh-keygen -t rsa -b 4096 -f /root/.ssh/id_rsa -C "denis rystsov" -q -N ""
fi

cp /root/.ssh/* /data/