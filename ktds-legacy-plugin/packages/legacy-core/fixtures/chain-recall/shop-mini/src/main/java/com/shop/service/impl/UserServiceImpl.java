package com.shop.service.impl;

import com.shop.service.UserService;
import com.shop.mapper.UserMapper;
import com.shop.domain.User;
import com.shop.util.FormatUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class UserServiceImpl implements UserService {

  @Autowired
  private UserMapper userMapper;

  private FormatUtil formatUtil;

  public User find(int id) {
    User u = userMapper.selectById(id);
    u.setName(formatUtil.normalize(u.getName()));
    return u;
  }
}
