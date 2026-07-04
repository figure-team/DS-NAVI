---
docId: 01_tech-stack
title: 기술 스택
methodology: as-built
status: DRAFT
sourceCommit: null
evidenceRate: 0.9230769230769231
---

# 기술 스택

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 언어

프로젝트에서 사용하는 프로그래밍 언어. project.languages 에서 채운다(file:line 앵커 없으면 [추정]).

<!-- claims:FENCE:OPEN -->
- [추정] 사용 언어: Java.
<!-- claims:FENCE:CLOSE -->

## 프레임워크 / 주요 라이브러리

핵심 프레임워크·라이브러리. project.frameworks 에서 채운다.

<!-- claims:FENCE:OPEN -->
- [확정] 프레임워크/라이브러리: hsqldb. 근거: `pom.xml:160`
- [확정] 프레임워크/라이브러리: mybatis. 근거: `pom.xml:87`
- [확정] 프레임워크/라이브러리: mybatis-spring. 근거: `pom.xml:92`
- [확정] 프레임워크/라이브러리: slf4j-api. 근거: `pom.xml:150`
- [확정] 프레임워크/라이브러리: slf4j-simple. 근거: `pom.xml:155`
- [확정] 프레임워크/라이브러리: spring-batch-infrastructure. 근거: `pom.xml:167`
- [확정] 프레임워크/라이브러리: spring-context. 근거: `pom.xml:97`
- [확정] 프레임워크/라이브러리: spring-jdbc. 근거: `pom.xml:102`
- [확정] 프레임워크/라이브러리: spring-web. 근거: `pom.xml:107`
- [확정] 프레임워크/라이브러리: stripes. 근거: `pom.xml:113`
- [확정] 프레임워크/라이브러리: taglibs-standard-impl. 근거: `pom.xml:133`
- [확정] 프레임워크/라이브러리: taglibs-standard-spec. 근거: `pom.xml:128`
<!-- claims:FENCE:CLOSE -->

## 모듈

빌드/배포 모듈. module 노드에서 채운다(filePath 보유 시 [확정]).

_(항목 없음)_
