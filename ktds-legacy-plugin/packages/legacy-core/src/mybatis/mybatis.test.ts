/**
 * MYBATIS 추출(Tier B) — 정규식 파서가 SQL 문에서 테이블·CRUD·컬럼을 결정론 추출.
 * 인라인 매퍼 XML 픽스처로 다중 FROM·INSERT·UPDATE·동적 태그·서브쿼리를 검증한다.
 */
import { describe, it, expect } from 'vitest'
import { parseMapperXml, buildMyBatisModel, namespaceBaseName, isMapperXmlDocument } from './extract.js'

const ACCOUNT_XML = `<?xml version="1.0"?>
<mapper namespace="org.mybatis.jpetstore.mapper.AccountMapper">
  <cache />
  <select id="getAccountByUsername" resultType="Account">
    SELECT SIGNON.USERNAME, ACCOUNT.EMAIL, PROFILE.LANGPREF, BANNERDATA.BANNERNAME
    FROM ACCOUNT, PROFILE, SIGNON, BANNERDATA
    WHERE ACCOUNT.USERID = #{username}
  </select>
  <update id="updateAccount" parameterType="Account">
    UPDATE ACCOUNT SET EMAIL = #{email}, PHONE = #{phone} WHERE USERID = #{username}
  </update>
  <insert id="insertAccount" parameterType="Account">
    INSERT INTO ACCOUNT (EMAIL, PHONE, USERID) VALUES (#{email}, #{phone}, #{username})
  </insert>
  <delete id="deleteAccount"> DELETE FROM ACCOUNT WHERE USERID = #{username} </delete>
</mapper>`

const ORDER_XML = `<mapper namespace="com.shop.OrderMapper">
  <select id="getOrder">
    SELECT * FROM ORDERS O JOIN LINEITEM L ON O.ID = L.ORDERID
    WHERE O.ID IN (SELECT ORDERID FROM SEQUENCE)
  </select>
</mapper>`

describe('parseMapperXml', () => {
  const m = parseMapperXml(ACCOUNT_XML, 'mapper/AccountMapper.xml')!

  it('namespace + 문 4종(정렬)', () => {
    expect(m.namespace).toBe('org.mybatis.jpetstore.mapper.AccountMapper')
    expect(m.statements.map((s) => s.id)).toEqual([
      'deleteAccount', 'getAccountByUsername', 'insertAccount', 'updateAccount',
    ])
  })

  it('CRUD 는 문 종류에서(select=R/insert=C/update=U/delete=D)', () => {
    const by = Object.fromEntries(m.statements.map((s) => [s.id, s.crud]))
    expect(by).toEqual({
      getAccountByUsername: 'R', updateAccount: 'U', insertAccount: 'C', deleteAccount: 'D',
    })
  })

  it('다중 FROM 테이블을 모두(정렬·대문자)', () => {
    const sel = m.statements.find((s) => s.id === 'getAccountByUsername')!
    expect(sel.tables).toEqual(['ACCOUNT', 'BANNERDATA', 'PROFILE', 'SIGNON'])
  })

  it('INSERT 컬럼리스트 / UPDATE SET 컬럼 추출', () => {
    expect(m.statements.find((s) => s.id === 'insertAccount')!.columns).toEqual(['EMAIL', 'PHONE', 'USERID'])
    expect(m.statements.find((s) => s.id === 'updateAccount')!.columns).toEqual(['EMAIL', 'PHONE'])
  })

  it('JOIN + 서브쿼리 FROM(서브쿼리 "(" 는 제외, JOIN 테이블 포함)', () => {
    const om = parseMapperXml(ORDER_XML, 'OrderMapper.xml')!
    const s = om.statements[0]
    expect(s.tables).toEqual(['LINEITEM', 'ORDERS', 'SEQUENCE'])
  })

  it('매퍼 XML 아니면 null', () => {
    expect(parseMapperXml('<beans><bean/></beans>', 'spring.xml')).toBeNull()
  })
})

describe('buildMyBatisModel', () => {
  it('매퍼 정렬 + 테이블 인벤토리(유니크·정렬)', () => {
    const model = buildMyBatisModel([
      { relPath: 'b/OrderMapper.xml', content: ORDER_XML },
      { relPath: 'a/AccountMapper.xml', content: ACCOUNT_XML },
      { relPath: 'notmapper.xml', content: '<x/>' },
    ])
    expect(model.mappers.map((m) => m.namespace)).toEqual([
      'com.shop.OrderMapper', 'org.mybatis.jpetstore.mapper.AccountMapper',
    ])
    expect(model.tables).toEqual(['ACCOUNT', 'BANNERDATA', 'LINEITEM', 'ORDERS', 'PROFILE', 'SEQUENCE', 'SIGNON'])
  })

  it('결정론: 같은 입력 두 번 동일', () => {
    const a = buildMyBatisModel([{ relPath: 'A.xml', content: ACCOUNT_XML }])
    const b = buildMyBatisModel([{ relPath: 'A.xml', content: ACCOUNT_XML }])
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('namespaceBaseName', () => {
  it('마지막 . 뒤', () => {
    expect(namespaceBaseName('org.mybatis.jpetstore.mapper.AccountMapper')).toBe('AccountMapper')
    expect(namespaceBaseName('PlainMapper')).toBe('PlainMapper')
  })
})

describe('isMapperXmlDocument — 루트 요소 판별(W4 오탐 회귀)', () => {
  it('실전 매퍼 헤더(선언+라이선스 주석+DOCTYPE) → true', () => {
    const real = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Copyright 2010-2022 the original author or authors.
-->
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="org.mybatis.jpetstore.mapper.AccountMapper">
</mapper>`
    expect(isMapperXmlDocument(real)).toBe(true)
    expect(isMapperXmlDocument(ACCOUNT_XML)).toBe(true)
    expect(isMapperXmlDocument(ORDER_XML)).toBe(true)
  })

  it('xml 선언 외 처리 명령(xml-stylesheet 등)이 앞에 있어도 true(리뷰 R4)', () => {
    const withPi = `<?xml version="1.0"?>
<?xml-stylesheet type="text/xsl" href="x.xsl"?>
<mapper namespace="a.B">
</mapper>`
    expect(isMapperXmlDocument(withPi)).toBe(true)
  })

  it('본문 코드 예제에만 <mapper 가 실린 문서(maven xdoc) → false', () => {
    // jpetstore src/site/**/xdoc/index.xml 실측 오탐 재현 — 루트는 <document>.
    const xdoc = `<?xml version="1.0" encoding="UTF-8"?>
<document xmlns="http://maven.apache.org/XDOC/2.0">
  <body><section name="Sample Code"><source>
    &lt;mapper namespace="org.mybatis.jpetstore.mapper.OrderMapper"&gt;
    <mapper namespace="org.mybatis.jpetstore.mapper.OrderMapper">
  </source></section></body>
</document>`
    expect(isMapperXmlDocument(xdoc)).toBe(false)
    // parseMapperXml 도 동일 게이트(모델 오염 차단).
    expect(parseMapperXml(xdoc, 'src/site/xdoc/index.xml')).toBeNull()
  })
})
