FROM ubuntu:17.10
LABEL maintainer="Denis Rystsov <rystsov.denis@gmail.com>"
RUN apt-get -y update
RUN apt-get -y upgrade
RUN apt-get -y update
RUN apt-get -y upgrade
RUN apt-get install -y wget sudo tmux vim less curl
RUN apt-get install -y openjdk-8-jdk openjdk-8-jre gnuplot
RUN /bin/bash -c "curl -sL https://deb.nodesource.com/setup_8.x | bash -"
RUN apt-get install -y nodejs
WORKDIR /root
RUN wget https://raw.githubusercontent.com/technomancy/leiningen/stable/bin/lein
RUN chmod +x lein
RUN mv lein /usr/bin/
CMD /bin/bash