export const customerServiceData = {
  funcMenu: {
    list: ['订单查询', '产品推荐', '退款处理', '知识查询', '转人工'],
    enable: ['订单查询', '产品推荐', '退款处理']
  },
  knowledgeList: [
    {
      id: 1,
      question: '如何申请退款？',
      answer: '进入我的订单页面，选择对应订单后点击申请退款。审核通过后，通常会在 1 到 3 个工作日原路退回。'
    },
    {
      id: 2,
      question: '发货后多久可以收到？',
      answer: '普通快递一般 2 到 5 天送达，偏远地区通常需要 5 到 7 天。'
    },
    {
      id: 3,
      question: '可以修改收货地址吗？',
      answer: '未发货订单通常可以联系人工客服修改，已发货后一般无法再修改收货地址。'
    }
  ],
  robots: [
    {
      id: 1,
      name: '电商客服 v3.0',
      status: true,
      welcome: '你好，请问有什么可以帮您？'
    }
  ],
  channels: ['网页客服', '小程序客服', 'APP 内嵌客服'],
  tickets: [
    {
      ticketId: 'TK10001',
      user: '用户8921',
      type: '退款纠纷',
      status: '待处理',
      time: '2026-07-06 10:22'
    },
    {
      ticketId: 'TK10002',
      user: '用户7633',
      type: '商品破损',
      status: '已完成',
      time: '2026-07-05 15:10'
    }
  ],
  dashboard: {
    totalChat: 1562,
    passRate: '98.2%',
    ticketTotal: 42,
    hotQuestion: ['退款流程', '发货时效', '商品质保', '修改地址']
  },
  config: {
    welcomeText: '你好，我是智能客服机器人 v3.0',
    similarityThreshold: 0.7,
    transferManualSwitch: true
  },
  roles: ['超级管理员', '客服专员', '只读查看员'],
  logs: [
    { time: '2026-07-06 11:30:22', content: '用户咨询退款流程' },
    { time: '2026-07-06 10:15:08', content: '管理员新增知识库条目' }
  ]
};
