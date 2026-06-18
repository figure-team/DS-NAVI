import { describe, it, expect } from 'vitest'
import { extractJpaFromSource, parseDerivedQuery, snakeCase } from './extract.js'

describe('snakeCase (BF1 암묵 명명전략)', () => {
  it('camelCase → snake_case', () => {
    expect(snakeCase('firstName')).toBe('first_name')
    expect(snakeCase('Owner')).toBe('owner')
    expect(snakeCase('VetSpecialty')).toBe('vet_specialty')
    expect(snakeCase('telephone')).toBe('telephone')
  })
})

describe('parseDerivedQuery (Tier B)', () => {
  it('findByX → 컬럼(snake, 정렬)', () => {
    expect(parseDerivedQuery('findByLastName')).toEqual(['last_name'])
    expect(parseDerivedQuery('findByFirstNameAndLastName')).toEqual(['first_name', 'last_name'])
    expect(parseDerivedQuery('countByActiveTrue')).toEqual(['active'])
    expect(parseDerivedQuery('findByLastNameOrderByFirstNameAsc')).toEqual(['last_name'])
  })
  it('파생쿼리 아님 → []', () => {
    expect(parseDerivedQuery('save')).toEqual([])
    expect(parseDerivedQuery('findAll')).toEqual([])
  })
  it('순수 연산자만 → [] (속성 없는 키워드는 컬럼으로 새지 않음, 리뷰 MED-2)', () => {
    expect(parseDerivedQuery('findByIn')).toEqual([])
    expect(parseDerivedQuery('countByTrue')).toEqual([])
  })
  it('대소문자 경계 안전 — 소문자 연속은 연산자로 오인하지 않음', () => {
    // 'Login' 의 끝 'in' 은 소문자라 PascalCase 연산자 'In' 과 다름 → 'log' 로 잘리지 않는다.
    expect(parseDerivedQuery('findByLogin')).toEqual(['login'])
    expect(parseDerivedQuery('findByDomain')).toEqual(['domain'])
  })
})

const ENTITY = `
package com.petclinic.owner;
import javax.persistence.*;
import java.util.List;

@Entity
@Table(name = "owners")
public class Owner {
  @Id
  @Column(name = "id")
  private Integer id;

  @Column(name = "first_name")
  private String firstName;

  private String telephone;

  @OneToMany(cascade = CascadeType.ALL, mappedBy = "owner")
  @JoinColumn(name = "owner_id")
  private List<Pet> pets;
}
`

describe('extractJpaFromSource — @Entity (Tier A + BF1)', () => {
  it('@Table(name=) 명시 → tableName CONFIRMED', async () => {
    const { entities } = await extractJpaFromSource(ENTITY, 'src/Owner.java')
    expect(entities).toHaveLength(1)
    const e = entities[0]
    expect(e.className).toBe('Owner')
    expect(e.tableName).toBe('owners')
    expect(e.tableExplicit).toBe(true)
    expect(e.tableConfidence).toBe('CONFIRMED')
    expect(e.idField).toBe('id')
  })

  it('@Column(name=) 명시 = CONFIRMED, 부재 = 암묵 명명전략 INFERRED', async () => {
    const { entities } = await extractJpaFromSource(ENTITY, 'src/Owner.java')
    const cols = entities[0].columns
    const firstName = cols.find((c) => c.fieldName === 'firstName')!
    expect(firstName.columnName).toBe('first_name')
    expect(firstName.explicit).toBe(true)
    expect(firstName.confidence).toBe('CONFIRMED')
    // telephone: @Column 없음 → 암묵 명명전략 → INFERRED
    const tel = cols.find((c) => c.fieldName === 'telephone')!
    expect(tel.columnName).toBe('telephone')
    expect(tel.explicit).toBe(false)
    expect(tel.confidence).toBe('INFERRED')
  })

  it('@OneToMany + @JoinColumn → 관계/FK (Tier B INFERRED), 컬럼 아님', async () => {
    const { entities } = await extractJpaFromSource(ENTITY, 'src/Owner.java')
    const e = entities[0]
    expect(e.columns.find((c) => c.fieldName === 'pets')).toBeUndefined()
    const rel = e.relations.find((r) => r.fieldName === 'pets')!
    expect(rel.kind).toBe('OneToMany')
    expect(rel.targetType).toBe('Pet') // List<Pet> → 원소 타입
    expect(rel.joinColumn).toBe('owner_id')
    expect(rel.confidence).toBe('INFERRED')
  })

  it('암묵 테이블명(@Table 부재) → snake_case(className) INFERRED', async () => {
    const src = '@Entity\npublic class VetSpecialty { @Id private Integer id; }'
    const { entities } = await extractJpaFromSource(src, 'src/VetSpecialty.java')
    expect(entities[0].tableName).toBe('vet_specialty')
    expect(entities[0].tableExplicit).toBe(false)
    expect(entities[0].tableConfidence).toBe('INFERRED')
  })
})

const REPO = `
package com.petclinic.owner;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface OwnerRepository extends JpaRepository<Owner, Integer> {
  Owner findByLastName(String lastName);

  @Query("SELECT o FROM Owner o WHERE o.city = :city")
  java.util.List<Owner> searchByCity(String city);

  @Query(value = "SELECT * FROM owners WHERE telephone = ?1", nativeQuery = true)
  Owner findByPhoneNative(String phone);
}
`

describe('extractJpaFromSource — JpaRepository (Tier A/B/C)', () => {
  it('JpaRepository<T,ID> → entity T + id (Tier A)', async () => {
    const { repositories } = await extractJpaFromSource(REPO, 'src/OwnerRepository.java')
    expect(repositories).toHaveLength(1)
    const r = repositories[0]
    expect(r.baseInterface).toBe('JpaRepository')
    expect(r.entityType).toBe('Owner')
    expect(r.idType).toBe('Integer')
  })

  it('파생쿼리 → 컬럼 (Tier B INFERRED)', async () => {
    const { repositories } = await extractJpaFromSource(REPO, 'src/OwnerRepository.java')
    const dq = repositories[0].derivedQueries.find((d) => d.method === 'findByLastName')!
    expect(dq.columns).toEqual(['last_name'])
    expect(dq.confidence).toBe('INFERRED')
  })

  it('@Query JPQL → Tier A CONFIRMED, nativeQuery → Tier C UNVERIFIED', async () => {
    const { repositories } = await extractJpaFromSource(REPO, 'src/OwnerRepository.java')
    const q = repositories[0].queries
    const jpql = q.find((x) => x.method === 'searchByCity')!
    expect(jpql.native).toBe(false)
    expect(jpql.confidence).toBe('CONFIRMED')
    expect(jpql.query).toContain('FROM Owner')
    const nat = q.find((x) => x.method === 'findByPhoneNative')!
    expect(nat.native).toBe(true)
    expect(nat.confidence).toBe('UNVERIFIED')
  })

  it('@Query 있는 메서드는 파생쿼리로 중복 추출하지 않는다', async () => {
    const { repositories } = await extractJpaFromSource(REPO, 'src/OwnerRepository.java')
    expect(repositories[0].derivedQueries.find((d) => d.method === 'findByPhoneNative')).toBeUndefined()
  })

  it('비-JPA Spring Data 베이스(MongoRepository)는 JPA repository 로 추출 안 함(리뷰 MED-1)', async () => {
    const mongo = `import org.springframework.data.mongodb.repository.MongoRepository;
public interface DocRepo extends MongoRepository<Doc, String> { Doc findByName(String n); }`
    const { repositories } = await extractJpaFromSource(mongo, 'src/DocRepo.java')
    expect(repositories).toHaveLength(0)
  })
})

describe('determinism', () => {
  it('동일 소스 → 동일 추출', async () => {
    const a = await extractJpaFromSource(ENTITY, 'src/Owner.java')
    const b = await extractJpaFromSource(ENTITY, 'src/Owner.java')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
