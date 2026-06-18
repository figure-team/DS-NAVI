package com.petclinic.vet;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

@Entity
@Table(name = "specialties")
public class Specialty {

  @Id
  private Integer id;

  @Column(name = "name")
  private String name;

  public Integer getId() {
    return id;
  }

  public String getName() {
    return name;
  }
}
