// Source photographs and recorded scenes shared by the interface studies.
const projects = [
  {
    title: '工位背后的假期', lines: ['工位背后的', '假期'], edition: '01', series: '桌上群岛',
    lead: '绕过桌上的蓝杯，去群岛度过一个假期。',
    front: '../assets/desk-original.jpg', frontLabel: '窗边的工位',
    alt: '窗边的白色书桌上摆着笔记本电脑、蓝杯和书。',
    back: 'islands', backLabel: '桌上群岛全景', route: '群岛路线', collection: '五座岛',
    backNote: '从蓝杯港湾启程，最后在洞窟书屋翻回最初的工位。',
    stops: [
      ['harbor','蓝杯港湾','在蓝杯旁折一只纸船，把它推向海面。'],
      ['cliff','蓝书白崖','走上白崖，从望远镜里寻找漂来的纸船。'],
      ['canyon','橙书峡谷','走进橙色书页形成的峡谷，试着压低书签。'],
      ['port','手机潮港','在潮港停一会，把手机拨到静音。'],
      ['cave','洞窟书屋','推开书屋的门。翻到桌上那一页，就回到了工位。'],
    ],
  },
  {
    title: '小狗的内脏博物馆', lines: ['小狗的', '内脏博物馆'], edition: '02', series: '身体博物馆',
    lead: '绕到小狗身侧，探访藏在身体里的六间展馆。',
    front: '../canine-museum/assets/original.jpg', frontLabel: '地毯上的小狗',
    alt: '白毛黄耳的小狗坐在地毯上，歪头望向镜头。',
    back: 'overview', backLabel: '右侧剖景全景', route: '展馆索引', collection: '六间展馆',
    backNote: '右侧剖面藏着六馆。原作里还可以跟随一口食物，在沿途停靠。',
    stops: [
      ['heart','心跳钟楼','心脏深处有一座钟楼，黄铜摆锤划过红色钟面。'],
      ['lungs','呼吸风琴厅','两叶展厅共用一组风箱，铜管沿着肺叶排开。'],
      ['liver','琥珀光廊','肝脏里的三扇窗，把穿过琥珀的光投在回廊里。'],
      ['stomach','旋流陶坊','胃壁围出一间陶坊。陶轮上的青瓷罐缓缓转动。'],
      ['kidney','双泉水务馆','两座滤泉塔接住水珠，池间留着一条窄窄的走道。'],
      ['gut','回廊档案馆','袖珍书架沿肠道折返，楼梯尽头留了一盏阅读灯。'],
    ],
  },
];

const paths = {
  next: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  prev: '<path d="M20 12H5m6 6-6-6 6-6"/>',
  play: '<path d="m7 4 12 8-12 8Z" fill="currentColor" stroke="none"/>',
  reset: '<path d="M7 7a7 7 0 1 1-1 9M7 3v5H2"/>',
  mark: '<path d="M4 2.5h6a9.5 9.5 0 0 1 0 19H4z M8 6.5h2a5.5 5.5 0 0 1 0 11H8z"/>',
};
function icon(name) {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+paths[name]+'</svg>';
}
function still(key) { return './stills/'+key+'.webp'; }
function frames(p) {
  return [
    {src:p.front, label:p.frontLabel, alt:p.alt},
    {src:still(p.back), label:p.backLabel, note:p.backNote},
    ...p.stops.map(([key,label,note])=>({src:still(key),label,note})),
  ];
}
