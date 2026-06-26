-- 공통코드 시드 — 상태값/등급 정책의 결정론 근거(Tier 2). 다중 VALUES + 단일 VALUES 혼합.
INSERT INTO common_code (code, code_name, grp) VALUES
  ('ACTIVE',    '활성', 'MEMBER_STATUS'),
  ('DORMANT',   '휴면', 'MEMBER_STATUS'),
  ('WITHDRAWN', '탈퇴', 'MEMBER_STATUS');

INSERT INTO common_code (code, code_name, grp) VALUES ('BRONZE', '브론즈', 'MEMBER_GRADE');
