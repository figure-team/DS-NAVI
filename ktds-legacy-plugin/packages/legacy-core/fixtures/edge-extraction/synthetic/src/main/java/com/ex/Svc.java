package com.ex;

import org.springframework.beans.factory.annotation.Autowired;

public class Svc extends Base implements Greeter {

  @Autowired
  private Repo repo;

  private Helper helper;

  private SqlSession session;

  public Svc(Audit audit) {
    audit.record("init");
  }

  public String greet() {
    helper.help();
    Unknown u = makeUnknown();
    return session.selectOne("com.ex.OrderMapper.find", 1);
  }

  private Unknown makeUnknown() {
    return null;
  }
}
