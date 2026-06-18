package com.shop.mapper;

import com.shop.domain.User;

public interface UserMapper {
  User selectById(int id);
}
