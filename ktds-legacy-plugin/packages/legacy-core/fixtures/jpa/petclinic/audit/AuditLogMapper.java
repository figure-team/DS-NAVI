package com.petclinic.audit;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

// MyBatis 매퍼(AC-16b): Spring Data 베이스 인터페이스 미상속 →
// JPA 추출기는 repository 로 잡으면 안 된다. XML 매퍼는 기존 edges/step-layer 가 담당.
@Mapper
public interface AuditLogMapper {

  List<String> selectAuditLogsByOwner(@Param("ownerId") Integer ownerId);
}
