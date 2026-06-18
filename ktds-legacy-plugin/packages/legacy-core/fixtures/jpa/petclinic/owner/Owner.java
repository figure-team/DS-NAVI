package com.petclinic.owner;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.OneToMany;
import javax.persistence.Table;
import java.util.List;

@Entity
@Table(name = "owners")
public class Owner {

  @Id
  @Column(name = "id")
  private Integer id;

  @Column(name = "first_name")
  private String firstName;

  @Column(name = "last_name")
  private String lastName;

  // @Column 부재 → 암묵 명명전략(city) INFERRED
  private String city;

  @OneToMany(mappedBy = "owner")
  @JoinColumn(name = "owner_id")
  private List<Pet> pets;

  public Integer getId() {
    return id;
  }

  public String getFirstName() {
    return firstName;
  }

  public String getLastName() {
    return lastName;
  }

  public String getCity() {
    return city;
  }

  public List<Pet> getPets() {
    return pets;
  }
}
