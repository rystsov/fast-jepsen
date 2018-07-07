FROM ubuntu:17.10
LABEL maintainer="Denis Rystsov <rystsov.denis@gmail.com>"
RUN apt-get update -y
RUN apt-get install -y --fix-missing wget supervisor iptables gdb sudo
RUN apt-get install -y --fix-missing iputils-ping vim tmux less curl
RUN apt-get install -y openjdk-8-jdk openjdk-8-jre
RUN /bin/bash -c "curl -sL https://deb.nodesource.com/setup_8.x | bash -"
RUN apt-get install -y nodejs
RUN apt-get install -y --fix-missing ssh net-tools
RUN mkdir /run/sshd
RUN mkdir /root/.ssh
COPY id_rsa /root/.ssh/id_rsa
COPY id_rsa.pub /root/.ssh/id_rsa.pub
RUN /bin/bash -c "cat /root/.ssh/id_rsa.pub > /root/.ssh/authorized_keys"
RUN mkdir -p /mongo/logs
WORKDIR /mongo
RUN wget https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-2.6.7.tgz
RUN tar -xzvf mongodb-linux-x86_64-2.6.7.tgz
RUN rm mongodb-linux-x86_64-2.6.7.tgz
COPY run-mongo.sh /mongo/run-mongo.sh
COPY run-api-js.sh /mongo/run-api-js.sh
COPY topology /mongo/topology
COPY mongo.conf /etc/supervisor/conf.d/mongo.conf
COPY api-js /mongo/api-js
WORKDIR /mongo/api-js
RUN npm install
WORKDIR /mongo
CMD /usr/bin/supervisord -n