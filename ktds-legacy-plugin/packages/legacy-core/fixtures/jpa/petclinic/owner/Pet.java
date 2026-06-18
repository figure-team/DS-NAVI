package com.petclinic.owner;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.ManyToOne;
import javax.persistence.Table;

@Entity
@Table(name = "pets")
public class Pet {

  @Id
  private Integer id;

  @Column(name = "name")
  private String name;

  @ManyToOne
  @JoinColumn(name = "owner_id")
  private Owner owner;

  @ManyToOne
  @JoinColumn(name = "type_id")
  private PetType type;

  public Integer getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public Owner getOwner() {
    return owner;
  }

  public PetType getType() {
    return type;
  }
}
