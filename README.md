# get-ip

顾名思义，获取自己的公网ip，通过部署在 edgeone 边缘函数，cloudflare worker 等上。



1. 普通用法

```bash
curl ip.bravexist.cn
```



2. 进阶用法

```bash
curl ip.bravexist.cn/json
curl ip.bravexist.cn/txt
curl ip.bravexist.cn/full
```



关闭 https 自动跳转

- cloudflare：域名、ssl、边缘证书，始终使用https（关闭）
