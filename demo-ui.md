# UI 原型演示

这是一个可直接交互的 UI 原型：点击「登录」打开控制台，控制台里可以打开详情窗口、查询表格、操作 3D 模型、播放动画和在画板上绘图。

```ui
{
  "version": 2,
  "start": "p1",
  "pages": [
    {
      "id": "p1",
      "name": "登录窗口",
      "kind": "window",
      "parentId": "",
      "open": true,
      "x": 80,
      "y": 60,
      "width": 420,
      "height": 320,
      "elements": [
        {
          "id": "e1",
          "type": "heading",
          "parentId": "",
          "x": 30,
          "y": 26,
          "w": 360,
          "h": 40,
          "text": "欢迎登录",
          "props": {
            "level": "1"
          }
        },
        {
          "id": "e2",
          "type": "text",
          "parentId": "",
          "x": 30,
          "y": 82,
          "w": 360,
          "h": 24,
          "text": "账号"
        },
        {
          "id": "e3",
          "type": "input",
          "parentId": "",
          "x": 30,
          "y": 108,
          "w": 360,
          "h": 38,
          "text": "",
          "props": {
            "placeholder": "请输入账号",
            "value": "admin"
          }
        },
        {
          "id": "e4",
          "type": "text",
          "parentId": "",
          "x": 30,
          "y": 158,
          "w": 360,
          "h": 24,
          "text": "密码"
        },
        {
          "id": "e5",
          "type": "input",
          "parentId": "",
          "x": 30,
          "y": 184,
          "w": 360,
          "h": 38,
          "text": "",
          "props": {
            "placeholder": "请输入密码",
            "inputType": "password",
            "value": "123456"
          }
        },
        {
          "id": "e6",
          "type": "button",
          "parentId": "",
          "x": 30,
          "y": 240,
          "w": 360,
          "h": 40,
          "text": "登录",
          "props": {
            "variant": "primary"
          }
        },
        {
          "id": "e7",
          "type": "text",
          "parentId": "",
          "x": 30,
          "y": 290,
          "w": 360,
          "h": 22,
          "text": "演示账号已预填，点击登录进入控制台"
        }
      ]
    },
    {
      "id": "p2",
      "name": "控制台",
      "kind": "window",
      "parentId": "",
      "open": false,
      "x": 80,
      "y": 60,
      "width": 960,
      "height": 600,
      "elements": [
        {
          "id": "e10",
          "type": "navbar",
          "parentId": "",
          "x": 0,
          "y": 0,
          "w": 960,
          "h": 52,
          "text": "订单中心",
          "props": {
            "items": "概览|订单|设置"
          }
        },
        {
          "id": "e11",
          "type": "sidebar",
          "parentId": "",
          "x": 0,
          "y": 52,
          "w": 180,
          "h": 548,
          "text": "导航",
          "props": {
            "items": "数据概览|订单列表|文件|设置"
          }
        },
        {
          "id": "e12",
          "type": "content",
          "parentId": "",
          "x": 180,
          "y": 52,
          "w": 780,
          "h": 548,
          "text": "工作区",
          "props": {
            "note": "容器可以包含其他控件"
          }
        },
        {
          "id": "e16",
          "type": "list",
          "parentId": "",
          "x": 570,
          "y": 74,
          "w": 170,
          "h": 130,
          "text": "任务",
          "props": {
            "items": "需求评审\n接口联调\n发布上线"
          }
        },
        {
          "id": "e17",
          "type": "model3d",
          "parentId": "",
          "x": 760,
          "y": 69,
          "w": 180,
          "h": 140,
          "text": "3D 模型",
          "props": {
            "src": "assets/WSON8烧录座-20261031-225235-833.step",
            "color": "#0969da"
          }
        },
        {
          "id": "e18",
          "type": "animation",
          "parentId": "",
          "x": 760,
          "y": 224,
          "w": 180,
          "h": 100,
          "text": "动画"
        },
        {
          "id": "e19",
          "type": "canvas",
          "parentId": "",
          "x": 760,
          "y": 334,
          "w": 180,
          "h": 110,
          "text": "画板",
          "props": {
            "color": "#0969da",
            "brush": "3"
          }
        },
        {
          "id": "e20",
          "type": "database",
          "parentId": "",
          "x": 180,
          "y": 330,
          "w": 340,
          "h": 180,
          "text": "订单数据库",
          "props": {
            "items": "id|客户|金额\n1|张三|120\n2|李四|80",
            "placeholder": "搜索客户或编号"
          }
        },
        {
          "id": "e22",
          "type": "button",
          "parentId": "",
          "x": 760,
          "y": 470,
          "w": 180,
          "h": 34,
          "text": "关闭控制台",
          "props": {
            "variant": "secondary"
          }
        },
        {
          "id": "e33",
          "type": "model3d",
          "parentId": "",
          "x": 519,
          "y": 329,
          "w": 240,
          "h": 180,
          "text": "",
          "props": {
            "src": "assets/立式2X6排母-20261031-225339-111.step"
          }
        },
        {
          "id": "e35",
          "type": "model3d",
          "parentId": "",
          "x": 144,
          "y": 144,
          "w": 240,
          "h": 180,
          "text": "",
          "props": {
            "src": "assets/SOP8烧录座-20261031-224338-888.step"
          }
        },
        {
          "id": "e13",
          "type": "card",
          "parentId": "e12",
          "x": 200,
          "y": 74,
          "w": 340,
          "h": 230,
          "text": "最近订单",
          "props": {
            "note": "点击表格行可选中"
          }
        },
        {
          "id": "e14",
          "type": "table",
          "parentId": "e13",
          "x": 234,
          "y": 174,
          "w": 306,
          "h": 130,
          "text": "订单列表",
          "props": {
            "items": "编号|客户|金额\nA01|张三|120\nA02|李四|80\nA03|王五|260"
          }
        },
        {
          "id": "e15",
          "type": "button",
          "parentId": "e13",
          "x": 216,
          "y": 252,
          "w": 120,
          "h": 34,
          "text": "打开详情",
          "props": {
            "variant": "primary"
          }
        }
      ]
    },
    {
      "id": "p3",
      "name": "订单详情",
      "kind": "dialog",
      "parentId": "p2",
      "open": false,
      "x": 0,
      "y": 0,
      "width": 420,
      "height": 260,
      "elements": [
        {
          "id": "e30",
          "type": "heading",
          "parentId": "",
          "x": 24,
          "y": 22,
          "w": 360,
          "h": 36,
          "text": "订单详情",
          "props": {
            "level": "2"
          }
        },
        {
          "id": "e31",
          "type": "text",
          "parentId": "",
          "x": 24,
          "y": 70,
          "w": 360,
          "h": 60,
          "text": "这是一个归属于控制台的对话框",
          "props": {
            "note": "选择表格行后会更新这里"
          }
        },
        {
          "id": "e32",
          "type": "button",
          "parentId": "",
          "x": 296,
          "y": 206,
          "w": 100,
          "h": 32,
          "text": "关闭",
          "props": {
            "variant": "secondary"
          }
        }
      ]
    }
  ],
  "connections": [
    {
      "id": "c1",
      "from": "e6",
      "event": "click",
      "action": "navigate",
      "target": "p2",
      "value": ""
    },
    {
      "id": "c2",
      "from": "e15",
      "event": "click",
      "action": "open",
      "target": "p3",
      "value": ""
    },
    {
      "id": "c3",
      "from": "e32",
      "event": "click",
      "action": "close",
      "target": "p3",
      "value": ""
    },
    {
      "id": "c4",
      "from": "e14",
      "event": "select",
      "action": "setText",
      "target": "e31",
      "value": "已选择一行订单"
    },
    {
      "id": "c5",
      "from": "e22",
      "event": "click",
      "action": "navigate",
      "target": "p1",
      "value": ""
    }
  ]
}
```
