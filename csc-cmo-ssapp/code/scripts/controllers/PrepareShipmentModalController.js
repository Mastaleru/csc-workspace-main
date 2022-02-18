// MyModalController.js
const { WebcController } = WebCardinal.controllers;

class PrepareShipmentModalController extends WebcController {

  constructor(...props) {
    super(...props);

    this.onTagEvent('navigate-to-shipment', 'click', (e) => {
      this.navigateToPageTag('shipment', {
        uid:this.model.uid
      });
    });

    this.onTagEvent('navigate-to-dashboard', 'click', (e) => {
      this.navigateToPageTag('dashboard', {});
    });
  }

}

export default PrepareShipmentModalController;
