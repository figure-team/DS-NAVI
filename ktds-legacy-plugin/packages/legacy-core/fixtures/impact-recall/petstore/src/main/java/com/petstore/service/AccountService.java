package com.petstore.service;

import com.petstore.domain.Account;

public interface AccountService {
  Account find(int id);

  Account register(Account account);
}
