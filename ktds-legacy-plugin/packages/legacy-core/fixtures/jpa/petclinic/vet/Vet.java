package com.petclinic.vet;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.ManyToMany;
import javax.persistence.Table;
import java.util.Set;

@Entity
@Table(name = "vets")
public class Vet {

  @Id
  private Integer id;

  @Column(name = "first_name")
  private String firstName;

  @ManyToMany
  @JoinColumn(name = "vet_id")
  private Set<Specialty> specialties;

  public Integer getId() {
    return id;
  }

  public String getFirstName() {
    return firstName;
  }

  public Set<Specialty> getSpecialties() {
    return specialties;
  }
}
