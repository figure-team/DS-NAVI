package com.petstore.service.impl;

import com.petstore.service.AccountService;
import com.petstore.persistence.AccountMapper;
import com.petstore.domain.Account;
import com.petstore.common.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class AccountServiceImpl implements AccountService {

  @Autowired
  private AccountMapper accountMapper;

  private StringUtils stringUtils;

  public Account find(int id) {
    Account a = accountMapper.selectById(id);
    a.setName(stringUtils.normalize(a.getName()));
    return a;
  }

  public Account register(Account account) {
    account.setName(stringUtils.normalize(account.getName()));
    accountMapper.insert(account);
    return account;
  }
}
