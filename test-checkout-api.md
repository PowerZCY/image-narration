# Checkout API 改进测试指南

## 改进内容

1. **统一错误信息**：使用三种标准英文错误信息
2. **订单创建重试机制**：失败后自动重试一次
3. **防止数据不一致**：订单创建失败时不返回session URL

## 三种标准错误信息

- 认证错误：`"Please sign in to continue"`
- 网络错误：`"Network error. Please check your connection and try again."`
- 系统错误：`"System busy. Please try again later."`

## 测试场景

### 1. 测试认证错误
```bash
curl -X POST http://localhost:3000/api/payments/checkout \
  -H "Content-Type: application/json" \
  -d '{"priceId":"price_test"}'
```
**预期结果**：401状态码，错误信息："Please sign in to continue"

### 2. 测试无效参数错误
```bash
# 登录后测试无效priceId
curl -X POST http://localhost:3000/api/payments/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <valid_token>" \
  -d '{"priceId":"invalid_price"}'
```
**预期结果**：500状态码，错误信息："System busy. Please try again later."

### 3. 测试缺失参数错误
```bash
# 登录后测试缺失priceId
curl -X POST http://localhost:3000/api/payments/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <valid_token>" \
  -d '{}'
```
**预期结果**：500状态码，错误信息："System busy. Please try again later."

## 重试机制验证

订单创建会自动重试最多2次（初始尝试 + 1次重试），每次重试间隔1秒。

检查服务器日志中的以下信息：
- `Order creation attempt 1 failed: ...`
- `Order creation attempt 2 failed: ...`
- `Order creation failed after 2 attempts`

## 前端集成

前端组件会接收这些错误信息并显示给用户：
- PricingCards.tsx: 通过alert()显示错误
- PricingDialog.tsx: 通过alert()显示错误

## 验证兜底机制

即使订单创建失败，webhook的重建逻辑仍能作为最后防线：
- 查看 `/api/payments/webhook` 中的 `reconstructOrderFromSession` 函数
- 当支付成功但找不到订单时，会自动重建订单记录

## 日志监控

检查以下日志信息：
- 重试过程：`Order creation attempt X failed`
- 成功创建：`Order created successfully on attempt X`
- 最终失败：`Order creation failed after 2 attempts`
- 参数错误：`Missing priceId in checkout request` 或 `Invalid priceId received`