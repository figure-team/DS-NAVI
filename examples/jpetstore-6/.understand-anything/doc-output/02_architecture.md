---
docId: 02_architecture
title: 아키텍처 설계서
methodology: as-built
status: DRAFT
sourceCommit: a73a85b4dc02c36b56a65d9a79f6cd45b350a700
evidenceRate: 0.976
---

# 아키텍처 설계서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 레이어

시스템을 구성하는 계층(api/service/dao/db 등)과 구성요소 수. layer 집계에서 채운다([추정]).

<!-- claims:FENCE:OPEN -->
- [추정] 레이어: api (26개 구성요소).
- [추정] 레이어: dao (21개 구성요소).
- [추정] 레이어: service (14개 구성요소).
<!-- claims:FENCE:CLOSE -->

## 의존 방향

모듈/계층 간 의존 방향. depends_on·imports 엣지에서 채운다([확정]).

<!-- claims:FENCE:OPEN -->
- [확정] 의존: src/main/java/org/mybatis/jpetstore/domain/CartItem.java → src/main/java/org/mybatis/jpetstore/domain/Item.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/domain/CartItem.java:31`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/domain/Item.java → src/main/java/org/mybatis/jpetstore/domain/Product.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/domain/Item.java:41`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/domain/LineItem.java → src/main/java/org/mybatis/jpetstore/domain/CartItem.java (ctor-param). 근거: `src/main/java/org/mybatis/jpetstore/domain/LineItem.java:27`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/domain/LineItem.java → src/main/java/org/mybatis/jpetstore/domain/Item.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/domain/LineItem.java:36`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java → src/main/java/org/mybatis/jpetstore/domain/Account.java (import). 근거: `src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java → src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml (mapper-xml). 근거: `src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java → src/main/java/org/mybatis/jpetstore/domain/Category.java (import). 근거: `src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java → src/main/resources/org/mybatis/jpetstore/mapper/CategoryMapper.xml (mapper-xml). 근거: `src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java → src/main/java/org/mybatis/jpetstore/domain/Item.java (import). 근거: `src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java → src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml (mapper-xml). 근거: `src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java → src/main/java/org/mybatis/jpetstore/domain/LineItem.java (import). 근거: `src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java → src/main/resources/org/mybatis/jpetstore/mapper/LineItemMapper.xml (mapper-xml). 근거: `src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java → src/main/java/org/mybatis/jpetstore/domain/Order.java (import). 근거: `src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java → src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml (mapper-xml). 근거: `src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java → src/main/java/org/mybatis/jpetstore/domain/Product.java (import). 근거: `src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java → src/main/resources/org/mybatis/jpetstore/mapper/ProductMapper.xml (mapper-xml). 근거: `src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java → src/main/java/org/mybatis/jpetstore/domain/Sequence.java (import). 근거: `src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java → src/main/resources/org/mybatis/jpetstore/mapper/SequenceMapper.xml (mapper-xml). 근거: `src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/AccountService.java → src/main/java/org/mybatis/jpetstore/domain/Account.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/AccountService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/AccountService.java → src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java (ctor-param). 근거: `src/main/java/org/mybatis/jpetstore/service/AccountService.java:30`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/AccountService.java → src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/service/AccountService.java:33`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/AccountService.java → src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/AccountService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/CatalogService.java → src/main/java/org/mybatis/jpetstore/domain/Category.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/CatalogService.java → src/main/java/org/mybatis/jpetstore/domain/Item.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/CatalogService.java → src/main/java/org/mybatis/jpetstore/domain/Product.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/CatalogService.java → src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java (ctor-param). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:34`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/CatalogService.java → src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:37`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/CatalogService.java → src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/CatalogService.java → src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java (ctor-param). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:34`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/CatalogService.java → src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:38`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/CatalogService.java → src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/CatalogService.java → src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java (ctor-param). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:34`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/CatalogService.java → src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:39`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/CatalogService.java → src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/domain/Item.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/domain/Order.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/domain/Sequence.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java (ctor-param). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java:37`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java:40`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java (ctor-param). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java:37`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java:43`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java (ctor-param). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java:37`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java:41`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java (ctor-param). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java:37`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java:42`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/service/OrderService.java → src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java (import). 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java → src/main/java/org/mybatis/jpetstore/domain/Account.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:59`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java → src/main/java/org/mybatis/jpetstore/domain/Account.java (import). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java → src/main/java/org/mybatis/jpetstore/domain/Product.java (import). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java → src/main/java/org/mybatis/jpetstore/service/AccountService.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:54`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java → src/main/java/org/mybatis/jpetstore/service/AccountService.java (import). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java → src/main/java/org/mybatis/jpetstore/service/CatalogService.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:56`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java → src/main/java/org/mybatis/jpetstore/service/CatalogService.java (import). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java → src/main/java/org/mybatis/jpetstore/web/actions/AbstractActionBean.java (extends). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:42`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java → src/main/java/org/mybatis/jpetstore/domain/Cart.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:48`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java → src/main/java/org/mybatis/jpetstore/domain/Cart.java (import). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java → src/main/java/org/mybatis/jpetstore/domain/CartItem.java (import). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java → src/main/java/org/mybatis/jpetstore/domain/Item.java (import). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java → src/main/java/org/mybatis/jpetstore/service/CatalogService.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:45`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java → src/main/java/org/mybatis/jpetstore/service/CatalogService.java (import). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java → src/main/java/org/mybatis/jpetstore/web/actions/AbstractActionBean.java (extends). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:37`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java → src/main/java/org/mybatis/jpetstore/domain/Category.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:52`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java → src/main/java/org/mybatis/jpetstore/domain/Category.java (import). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java → src/main/java/org/mybatis/jpetstore/domain/Item.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:60`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java → src/main/java/org/mybatis/jpetstore/domain/Item.java (import). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java → src/main/java/org/mybatis/jpetstore/domain/Product.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:56`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java → src/main/java/org/mybatis/jpetstore/domain/Product.java (import). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java → src/main/java/org/mybatis/jpetstore/service/CatalogService.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:46`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java → src/main/java/org/mybatis/jpetstore/service/CatalogService.java (import). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java → src/main/java/org/mybatis/jpetstore/web/actions/AbstractActionBean.java (extends). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:35`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java → src/main/java/org/mybatis/jpetstore/domain/Order.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:53`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java → src/main/java/org/mybatis/jpetstore/domain/Order.java (import). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java → src/main/java/org/mybatis/jpetstore/service/OrderService.java (field-type). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:50`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java → src/main/java/org/mybatis/jpetstore/service/OrderService.java (import). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java`
- [확정] 의존: src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java → src/main/java/org/mybatis/jpetstore/web/actions/AbstractActionBean.java (extends). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:37`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/mapper/AccountMapperTest.java → src/main/java/org/mybatis/jpetstore/domain/Account.java (import). 근거: `src/test/java/org/mybatis/jpetstore/mapper/AccountMapperTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/mapper/AccountMapperTest.java → src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java (injection). 근거: `src/test/java/org/mybatis/jpetstore/mapper/AccountMapperTest.java:36`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/mapper/CategoryMapperTest.java → src/main/java/org/mybatis/jpetstore/domain/Category.java (import). 근거: `src/test/java/org/mybatis/jpetstore/mapper/CategoryMapperTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/mapper/CategoryMapperTest.java → src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java (injection). 근거: `src/test/java/org/mybatis/jpetstore/mapper/CategoryMapperTest.java:36`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/mapper/ItemMapperTest.java → src/main/java/org/mybatis/jpetstore/domain/Item.java (import). 근거: `src/test/java/org/mybatis/jpetstore/mapper/ItemMapperTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/mapper/ItemMapperTest.java → src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java (injection). 근거: `src/test/java/org/mybatis/jpetstore/mapper/ItemMapperTest.java:40`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/mapper/LineItemMapperTest.java → src/main/java/org/mybatis/jpetstore/domain/LineItem.java (import). 근거: `src/test/java/org/mybatis/jpetstore/mapper/LineItemMapperTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/mapper/LineItemMapperTest.java → src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java (injection). 근거: `src/test/java/org/mybatis/jpetstore/mapper/LineItemMapperTest.java:38`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/mapper/OrderMapperTest.java → src/main/java/org/mybatis/jpetstore/domain/Order.java (import). 근거: `src/test/java/org/mybatis/jpetstore/mapper/OrderMapperTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/mapper/OrderMapperTest.java → src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java (injection). 근거: `src/test/java/org/mybatis/jpetstore/mapper/OrderMapperTest.java:40`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/mapper/ProductMapperTest.java → src/main/java/org/mybatis/jpetstore/domain/Product.java (import). 근거: `src/test/java/org/mybatis/jpetstore/mapper/ProductMapperTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/mapper/ProductMapperTest.java → src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java (injection). 근거: `src/test/java/org/mybatis/jpetstore/mapper/ProductMapperTest.java:36`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/mapper/SequenceMapperTest.java → src/main/java/org/mybatis/jpetstore/domain/Sequence.java (import). 근거: `src/test/java/org/mybatis/jpetstore/mapper/SequenceMapperTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/mapper/SequenceMapperTest.java → src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java (injection). 근거: `src/test/java/org/mybatis/jpetstore/mapper/SequenceMapperTest.java:34`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/AccountServiceTest.java → src/main/java/org/mybatis/jpetstore/domain/Account.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/AccountServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/AccountServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java (field-type). 근거: `src/test/java/org/mybatis/jpetstore/service/AccountServiceTest.java:37`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/AccountServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/AccountServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/AccountServiceTest.java → src/main/java/org/mybatis/jpetstore/service/AccountService.java (field-type). 근거: `src/test/java/org/mybatis/jpetstore/service/AccountServiceTest.java:40`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java → src/main/java/org/mybatis/jpetstore/domain/Category.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java → src/main/java/org/mybatis/jpetstore/domain/Item.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java → src/main/java/org/mybatis/jpetstore/domain/Product.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java (field-type). 근거: `src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java:44`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java (field-type). 근거: `src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java:46`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java (field-type). 근거: `src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java:42`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java → src/main/java/org/mybatis/jpetstore/service/CatalogService.java (field-type). 근거: `src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java:49`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java → src/main/java/org/mybatis/jpetstore/domain/Item.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java → src/main/java/org/mybatis/jpetstore/domain/LineItem.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java → src/main/java/org/mybatis/jpetstore/domain/Order.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java → src/main/java/org/mybatis/jpetstore/domain/Sequence.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java (field-type). 근거: `src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java:49`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java (field-type). 근거: `src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java:53`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java (field-type). 근거: `src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java:51`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java (field-type). 근거: `src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java:55`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java → src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java (import). 근거: `src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java → src/main/java/org/mybatis/jpetstore/service/OrderService.java (field-type). 근거: `src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java:58`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/web/actions/AccountActionBeanTest.java → src/main/java/org/mybatis/jpetstore/domain/Account.java (import). 근거: `src/test/java/org/mybatis/jpetstore/web/actions/AccountActionBeanTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/web/actions/CartActionBeanTest.java → src/main/java/org/mybatis/jpetstore/domain/Cart.java (import). 근거: `src/test/java/org/mybatis/jpetstore/web/actions/CartActionBeanTest.java`
- [확정] 의존: src/test/java/org/mybatis/jpetstore/web/actions/CartActionBeanTest.java → src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java (field-type). 근거: `src/test/java/org/mybatis/jpetstore/web/actions/CartActionBeanTest.java:34`
<!-- claims:FENCE:CLOSE -->

## 순환 의존 후보

탐지된 순환 의존(있으면). 순환탐지 결과에서 채운다([확인 필요] — 동적 호출 미반영 가능).

_(항목 없음)_
