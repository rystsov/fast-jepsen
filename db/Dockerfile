FROM ubuntu:17.10
LABEL maintainer="Denis Rystsov <rystsov.denis@gmail.com>"
RUN apt-get update -y
RUN apt-get install -y --fix-missing wget supervisor iptables gdb
RUN apt-get install -y --fix-missing iputils-ping vim tmux less curl
RUN apt-get install -y openjdk-8-jdk openjdk-8-jre
RUN /bin/bash -c "curl -sL https://deb.nodesource.com/setup_8.x | bash -"
RUN apt-get install -y nodejs
RUN mkdir -p /mongo
WORKDIR /mongo
RUN wget https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-3.6.4.tgz
RUN tar -xzvf mongodb-linux-x86_64-3.6.4.tgz
RUN rm mongodb-linux-x86_64-3.6.4.tgz
RUN wget https://raw.githubusercontent.com/technomancy/leiningen/stable/bin/lein
RUN chmod +x lein
RUN mv lein /usr/bin/
COPY run-mongo.sh /mongo/run-mongo.sh
COPY run-api-js.sh /mongo/run-api-js.sh
COPY run-api-clj.sh /mongo/run-api-clj.sh
COPY topology /mongo/topology
COPY isolate.sh /mongo/isolate.sh
COPY rejoin.sh /mongo/rejoin.sh
COPY mongo.conf /etc/supervisor/conf.d/mongo.conf
COPY api-js /mongo/api-js
WORKDIR /mongo/api-js
RUN npm install
COPY api-clj /mongo/api-clj
WORKDIR /mongo/api-clj
RUN lein uberjar
WORKDIR /mongo
CMD /usr/bin/supervisord -n