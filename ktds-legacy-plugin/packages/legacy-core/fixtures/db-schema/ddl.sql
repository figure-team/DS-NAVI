-- 정책서 DB 스캐너 회귀 fixture — 제약·FK·CHECK·인덱스·주석·코드테이블 커버.

-- 회원 마스터(MySQL inline COMMENT + 테이블 COMMENT=).
CREATE TABLE member (
  member_id   BIGINT        NOT NULL PRIMARY KEY COMMENT '회원 고유 ID',
  email       VARCHAR(255)  NOT NULL UNIQUE COMMENT '로그인 이메일',
  status_cd   VARCHAR(10)   NOT NULL DEFAULT 'ACTIVE' COMMENT '회원 상태코드',
  grade       VARCHAR(10)   DEFAULT 'BRONZE',
  balance     DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_balance CHECK (balance >= 0),
  CONSTRAINT fk_member_status FOREIGN KEY (status_cd) REFERENCES common_code (code),
  UNIQUE (email),
  INDEX idx_member_status (status_cd)
) COMMENT='회원 마스터';

-- 공통코드(Oracle/PG 스타일 COMMENT ON 으로 주석).
CREATE TABLE common_code (
  code      VARCHAR(10)  NOT NULL PRIMARY KEY,
  code_name VARCHAR(100) NOT NULL,
  grp       VARCHAR(20)  NOT NULL
);

COMMENT ON TABLE common_code IS '공통 코드 정의';
COMMENT ON COLUMN common_code.code IS '코드 값';
