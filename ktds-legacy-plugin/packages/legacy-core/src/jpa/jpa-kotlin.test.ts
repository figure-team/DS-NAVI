/**
 * JPA / Spring Data 추출 — Kotlin(P4). java 판(extract.test.ts)과 동형 시나리오로
 * entity/repository/파생쿼리/@Query 3-Tier 신뢰 규약이 언어 무관하게 유지되는지 확인.
 */
import { describe, it, expect } from 'vitest'
import { extractJpaFromKotlinSource } from './extract.js'

const ENTITY = `
package com.petclinic.owner

import javax.persistence.*

@Entity
@Table(name = "owners")
data class Owner(
  @Id
  @Column(name = "id")
  val id: Long? = null,

  @Column(name = "first_name")
  val firstName: String = "",

  val telephone: String = "",

  @OneToMany(mappedBy = "owner")
  @JoinColumn(name = "owner_id")
  val pets: List<Pet> = mutableListOf()
) {
  @Column(name = "extra")
  var extra: String? = null

  @field:Transient
  var cached: String? = null
}
`

describe('extractJpaFromKotlinSource — @Entity (Tier A + BF1)', () => {
  it('@Table(name=) 명시 → tableName CONFIRMED, 주생성자 class_parameter 필드 인식', async () => {
    const { entities } = await extractJpaFromKotlinSource(ENTITY, 'src/Owner.kt')
    expect(entities).toHaveLength(1)
    const e = entities[0]
    expect(e.className).toBe('Owner')
    expect(e.tableName).toBe('owners')
    expect(e.tableExplicit).toBe(true)
    expect(e.tableConfidence).toBe('CONFIRMED')
    expect(e.idField).toBe('id')
  })

  it('@Column(name=) 명시 = CONFIRMED, 부재 = 암묵 명명전략 INFERRED', async () => {
    const { entities } = await extractJpaFromKotlinSource(ENTITY, 'src/Owner.kt')
    const cols = entities[0].columns
    const firstName = cols.find((c) => c.fieldName === 'firstName')!
    expect(firstName.columnName).toBe('first_name')
    expect(firstName.explicit).toBe(true)
    expect(firstName.confidence).toBe('CONFIRMED')
    const tel = cols.find((c) => c.fieldName === 'telephone')!
    expect(tel.columnName).toBe('telephone')
    expect(tel.explicit).toBe(false)
    expect(tel.confidence).toBe('INFERRED')
  })

  it('class_body property_declaration 필드도 인식(@Column 명시)', async () => {
    const { entities } = await extractJpaFromKotlinSource(ENTITY, 'src/Owner.kt')
    const extra = entities[0].columns.find((c) => c.fieldName === 'extra')!
    expect(extra.columnName).toBe('extra')
    expect(extra.explicit).toBe(true)
  })

  it('@field:Transient(use-site target) → 컬럼 아님', async () => {
    const { entities } = await extractJpaFromKotlinSource(ENTITY, 'src/Owner.kt')
    expect(entities[0].columns.find((c) => c.fieldName === 'cached')).toBeUndefined()
  })

  it('@OneToMany + @JoinColumn → 관계/FK (Tier B INFERRED), 컬럼 아님', async () => {
    const { entities } = await extractJpaFromKotlinSource(ENTITY, 'src/Owner.kt')
    const e = entities[0]
    expect(e.columns.find((c) => c.fieldName === 'pets')).toBeUndefined()
    const rel = e.relations.find((r) => r.fieldName === 'pets')!
    expect(rel.kind).toBe('OneToMany')
    expect(rel.targetType).toBe('Pet') // List<Pet> → 원소 타입
    expect(rel.joinColumn).toBe('owner_id')
    expect(rel.confidence).toBe('INFERRED')
  })

  it('암묵 테이블명(@Table 부재) → snake_case(className) INFERRED', async () => {
    const src = '@Entity\nclass VetSpecialty(@Id val id: Long? = null)\n'
    const { entities } = await extractJpaFromKotlinSource(src, 'src/VetSpecialty.kt')
    expect(entities[0].tableName).toBe('vet_specialty')
    expect(entities[0].tableExplicit).toBe(false)
    expect(entities[0].tableConfidence).toBe('INFERRED')
  })
})

const REPO = `
package com.petclinic.owner

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface OwnerRepository : JpaRepository<Owner, Long> {
  fun findByLastName(lastName: String): Owner?

  @Query("select o from Owner o where o.city = :city")
  fun searchByCity(city: String): List<Owner>

  @Query(value = "select * from owners where telephone = ?1", nativeQuery = true)
  fun findByPhoneNative(phone: String): Owner?
}
`

describe('extractJpaFromKotlinSource — JpaRepository (Tier A/B/C)', () => {
  it('JpaRepository<T,ID> → entity T + id (Tier A)', async () => {
    const { repositories } = await extractJpaFromKotlinSource(REPO, 'src/OwnerRepository.kt')
    expect(repositories).toHaveLength(1)
    const r = repositories[0]
    expect(r.baseInterface).toBe('JpaRepository')
    expect(r.entityType).toBe('Owner')
    expect(r.idType).toBe('Long')
  })

  it('파생쿼리 → 컬럼 (Tier B INFERRED)', async () => {
    const { repositories } = await extractJpaFromKotlinSource(REPO, 'src/OwnerRepository.kt')
    const dq = repositories[0].derivedQueries.find((d) => d.method === 'findByLastName')!
    expect(dq.columns).toEqual(['last_name'])
    expect(dq.confidence).toBe('INFERRED')
  })

  it('@Query JPQL → Tier A CONFIRMED, nativeQuery → Tier C UNVERIFIED', async () => {
    const { repositories } = await extractJpaFromKotlinSource(REPO, 'src/OwnerRepository.kt')
    const q = repositories[0].queries
    const jpql = q.find((x) => x.method === 'searchByCity')!
    expect(jpql.native).toBe(false)
    expect(jpql.confidence).toBe('CONFIRMED')
    expect(jpql.query).toContain('from Owner')
    const nat = q.find((x) => x.method === 'findByPhoneNative')!
    expect(nat.native).toBe(true)
    expect(nat.confidence).toBe('UNVERIFIED')
  })

  it('@Query 있는 메서드는 파생쿼리로 중복 추출하지 않는다', async () => {
    const { repositories } = await extractJpaFromKotlinSource(REPO, 'src/OwnerRepository.kt')
    expect(repositories[0].derivedQueries.find((d) => d.method === 'findByPhoneNative')).toBeUndefined()
  })

  it('비-JPA Spring Data 베이스(MongoRepository)는 JPA repository 로 추출 안 함', async () => {
    const mongo = `import org.springframework.data.mongodb.repository.MongoRepository
interface DocRepo : MongoRepository<Doc, String> { fun findByName(n: String): Doc? }`
    const { repositories } = await extractJpaFromKotlinSource(mongo, 'src/DocRepo.kt')
    expect(repositories).toHaveLength(0)
  })

  it('제네릭 인자 미해소(베이스만 상속) → unresolved 보고', async () => {
    const src = 'interface FooRepository : JpaRepository'
    const { repositories, unresolved } = await extractJpaFromKotlinSource(src, 'src/FooRepository.kt')
    expect(repositories).toHaveLength(1)
    expect(repositories[0].entityType).toBeNull()
    expect(unresolved).toHaveLength(1)
  })
})

describe('determinism', () => {
  it('동일 소스 → 동일 추출', async () => {
    const a = await extractJpaFromKotlinSource(ENTITY, 'src/Owner.kt')
    const b = await extractJpaFromKotlinSource(ENTITY, 'src/Owner.kt')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
