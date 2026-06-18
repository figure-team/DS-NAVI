package com.petstore.persistence;

import com.petstore.domain.Account;

public interface AccountMapper {
  Account selectById(int id);

  void insert(Account account);
}
