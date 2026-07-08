-- 중복 CREATE diff 픽스처 — 첫 파일(채택되는 정의).
CREATE TABLE t_order (
  order_id INT NOT NULL PRIMARY KEY,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(10)
);

CREATE TABLE t_pay (
  pay_id INT NOT NULL PRIMARY KEY,
  method VARCHAR(10)
);

-- 코드성 판정: 이름 패턴 미해당 + (코드컬럼 item_cd, 라벨컬럼 item_nm) 조합.
CREATE TABLE t_reason (
  item_cd VARCHAR(10) NOT NULL,
  item_nm VARCHAR(50)
);
