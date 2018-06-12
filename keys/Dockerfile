FROM ubuntu:17.10
LABEL maintainer="Denis Rystsov <rystsov.denis@gmail.com>"
RUN apt-get -y update --fix-missing
RUN apt-get -y install ssh --fix-missing
RUN mkdir /generator
COPY generate.sh /generator/generate.sh
CMD bash /generator/generate.sh
