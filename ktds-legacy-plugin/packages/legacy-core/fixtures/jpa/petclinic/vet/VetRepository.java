package com.petclinic.vet;

import org.springframework.data.repository.Repository;
import java.util.List;

// Repository<T,ID> 베이스 + entity 타입 Vet (파생쿼리/컬럼 없음)
public interface VetRepository extends Repository<Vet, Integer> {

  List<Vet> findAll();
}
