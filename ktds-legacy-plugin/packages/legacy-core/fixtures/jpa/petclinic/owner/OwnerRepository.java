package com.petclinic.owner;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface OwnerRepository extends JpaRepository<Owner, Integer> {

  // 파생쿼리(Tier B) → [last_name]
  List<Owner> findByLastName(String lastName);

  // 파생쿼리(Tier B) → [first_name, last_name]
  List<Owner> findByFirstNameAndLastName(String firstName, String lastName);

  // JPQL(Tier A CONFIRMED)
  @Query("SELECT o FROM Owner o WHERE o.city = :city")
  List<Owner> findByCity(String city);

  // nativeQuery(Tier C UNVERIFIED)
  @Query(value = "SELECT * FROM owners WHERE last_name = ?1", nativeQuery = true)
  List<Owner> searchNative(String lastName);
}
