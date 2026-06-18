package com.petclinic.owner;

import javax.persistence.Entity;
import javax.persistence.Id;

// @Table 부재 → 암묵 테이블명 snake_case(PetType) = "pet_type" INFERRED
@Entity
public class PetType {

  @Id
  private Integer id;

  // @Column 부재 → 암묵 컬럼명(name) INFERRED
  private String name;

  public Integer getId() {
    return id;
  }

  public String getName() {
    return name;
  }
}
