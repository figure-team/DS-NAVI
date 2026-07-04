#!/bin/sh
# 정산 배치 기동 스크립트 — 주석의 java -jar fake.jar 는 잡히면 안 된다.
JAVA_OPTS="-Xmx512m"
java $JAVA_OPTS -jar settle-batch.jar --spring.profiles.active=prod
java -cp lib/*:conf demo.batch.SettleMain
