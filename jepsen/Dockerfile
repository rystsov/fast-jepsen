FROM ubuntu:17.10
LABEL maintainer="Denis Rystsov <rystsov.denis@gmail.com>"
RUN apt-get -y update
RUN apt-get -y upgrade
RUN apt-get -y update
RUN apt-get -y upgrade
RUN apt-get install -y wget supervisor iptables gdb sudo
RUN apt-get install -y iputils-ping vim tmux less curl
RUN apt-get install -y ssh net-tools --fix-missing
RUN apt-get install -y openjdk-8-jdk openjdk-8-jre gnuplot
RUN mkdir /root/.ssh
RUN mkdir /jepsen
WORKDIR /jepsen
RUN wget https://raw.githubusercontent.com/technomancy/leiningen/stable/bin/lein
RUN chmod +x lein
RUN mv lein /usr/bin/
COPY src /jepsen/src
WORKDIR /jepsen/src
RUN lein uberjar
WORKDIR /jepsen/src
COPY jepsen.sh /jepsen/jepsen.sh
COPY id_rsa /root/.ssh/id_rsa
COPY id_rsa.pub /root/.ssh/id_rsa.pub
CMD /jepsen/jepsen.sh